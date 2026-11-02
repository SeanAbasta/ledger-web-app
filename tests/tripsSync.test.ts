import { beforeEach, describe, expect, it } from "vitest";
import { LedgerStore } from "../src/data/db";
import { exportBundle, importBundle, validateBundle } from "../src/data/exportImport";
import { addEntry, listMonth, updateEntry } from "../src/data/months";
import type { Trip, TripItem, TripsFile } from "../src/data/schema";
import { serialize, sha256Hex } from "../src/data/serialize";
import { GitHubApi } from "../src/sync/github";
import { MANIFEST, check, isDataPath, push, resolve, verify, type Ctx } from "../src/sync/handoff";
import { mergeDocs } from "../src/sync/merge";
import { FakeGitHub } from "./helpers/fakeGithub";

let gh: FakeGitHub;
let n = 0;
const api = () => new GitHubApi({ token: "good", owner: "me", repo: "data", fetch: gh.fetch, now: () => 1_000_000 });
const ctx = (device: string): Ctx => ({ api: api(), device, now: () => new Date("2026-10-07T12:00:00Z") });
const dev = async (name: string) => ({ store: await LedgerStore.open(`${name}-${n++}`), c: ctx(name) });

const T = "2026-10-01T00:00:00.000Z";
const trip = (over: Partial<Trip> = {}): Trip => ({ id: "t1", name: "Trip A", start: "2026-09-28", days: 7, budget: 5000000, rates: { JPY: "0.37" }, status: "open", updatedAt: T, ...over });
const item = (over: Partial<TripItem> = {}): TripItem => ({ id: "i1", tripId: "t1", date: "2026-09-28", amount: 1234500, currency: "JPY", rate: "0.37", category: "Food", createdAt: T, updatedAt: T, ...over });
const put = (store: LedgerStore, f: TripsFile) => store.transact(["trips.json"], (docs) => docs.set("trips.json", f as unknown as Record<string, unknown>));

beforeEach(() => { gh = new FakeGitHub(); });

describe("trips.json in the data set", () => {
  it("is a data path", () => {
    expect(isDataPath("trips.json")).toBe(true);
    expect(isDataPath("trip.json")).toBe(false);
  });

  it("round-trips between two devices", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await put(mac.store, { trips: [trip()], tripItems: [item()] });
    expect(await push(mac.store, mac.c)).toMatchObject({ status: "pushed" });
    expect(JSON.parse(gh.files()[MANIFEST]!).checksums["trips.json"]).toBeTruthy();
    expect(await check(win.store, win.c)).toBe("pulled");
    expect(await win.store.get("trips.json")).toEqual({ trips: [trip()], tripItems: [item()] });
    expect(await verify(win.store, win.c)).toEqual({ ok: true });
  });

  it("merges the two lists by id, so neither side loses new expenses", () => {
    const local = { trips: [trip()], tripItems: [item(), item({ id: "i2", updatedAt: "2026-10-02T00:00:00.000Z", note: "mine" })] };
    const remote = { trips: [trip({ name: "Older name", updatedAt: "2026-09-30T00:00:00.000Z" })], tripItems: [item({ id: "i3" }), item({ id: "i2", note: "theirs" })] };
    const merged = mergeDocs("trips.json", local, remote) as unknown as TripsFile;
    expect(merged.trips.map((t) => t.name)).toEqual(["Trip A"]);
    expect(merged.tripItems.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(merged.tripItems.find((i) => i.id === "i2")?.note).toBe("mine");
  });

  it("a tombstone wins only when it is newer", () => {
    const gone = item({ deleted: true, updatedAt: "2026-10-03T00:00:00.000Z" });
    const live = item({ updatedAt: "2026-10-02T00:00:00.000Z" });
    expect((mergeDocs("trips.json", { trips: [], tripItems: [live] }, { trips: [], tripItems: [gone] }) as unknown as TripsFile).tripItems[0]?.deleted).toBe(true);
    expect((mergeDocs("trips.json", { trips: [], tripItems: [gone] }, { trips: [], tripItems: [live] }) as unknown as TripsFile).tripItems[0]?.deleted).toBe(true);
    const newerLive = item({ updatedAt: "2026-10-04T00:00:00.000Z" });
    expect((mergeDocs("trips.json", { trips: [], tripItems: [newerLive] }, { trips: [], tripItems: [gone] }) as unknown as TripsFile).tripItems[0]?.deleted).toBeUndefined();
  });
});

/** An older copy knows five file kinds: it pushes its own files and a manifest that leaves trips.json out. */
async function olderCopyPushes(month: string, entries: unknown[]) {
  const a = api();
  const head = await a.getHead();
  const { treeSha, blobs } = await a.getBlobs(head);
  const old = JSON.parse(await a.getBlobText(blobs.get(MANIFEST)!));
  const sums: Record<string, string> = { ...old.checksums };
  delete sums["trips.json"];
  const monthText = serialize({ month, entries });
  sums[`months/${month}.json`] = await sha256Hex(monthText);
  const manifest = { ...old, revision: old.revision + 1, updatedBy: "old", checksums: sums };
  const commit = await a.createCommit({ parent: head, baseTree: treeSha, files: { [MANIFEST]: serialize(manifest), [`months/${month}.json`]: monthText }, message: "older copy" });
  await a.updateHead(commit);
}

describe("an older copy drops trips.json from the manifest", () => {
  async function setup() {
    const mac = await dev("mac");
    await put(mac.store, { trips: [trip()], tripItems: [item()] });
    await push(mac.store, mac.c);
    await olderCopyPushes("2026-10", []);
    expect(JSON.parse(gh.files()[MANIFEST]!).checksums["trips.json"]).toBeUndefined();
    expect(gh.files()["trips.json"]).toBeDefined(); // still in the repo
    return mac;
  }

  it("a device with no trips reads the file from the repo instead of dropping it", async () => {
    await setup();
    const win = await dev("win");
    expect(await check(win.store, win.c)).toBe("pulled");
    expect(await win.store.get("trips.json")).toEqual({ trips: [trip()], tripItems: [item()] });
    expect(await win.store.dirtyPaths()).toEqual(["trips.json"]); // so the next push lists it again
    expect(await push(win.store, win.c)).toMatchObject({ status: "pushed" });
    expect(JSON.parse(gh.files()[MANIFEST]!).checksums["trips.json"]).toBeTruthy();
  });

  it("the device that made the trips keeps them when it pulls", async () => {
    const mac = await setup();
    expect(await check(mac.store, mac.c)).toBe("pulled");
    expect(await mac.store.get("trips.json")).toEqual({ trips: [trip()], tripItems: [item()] });
    expect(await mac.store.dirtyPaths()).toEqual(["trips.json"]);
    expect(await push(mac.store, mac.c)).toMatchObject({ status: "pushed" });
    expect(JSON.parse(gh.files()[MANIFEST]!).checksums["trips.json"]).toBeTruthy();
  });

  it("keeps this device's newer trip edits when merged with the repo copy", async () => {
    const mac = await setup();
    await mac.store.clearDirty(["trips.json"]);
    // The repo file is still the old one; this device edited a trip but its change was already pushed once.
    await put(mac.store, { trips: [trip({ name: "Renamed", updatedAt: "2026-10-05T00:00:00.000Z" })], tripItems: [item()] });
    await mac.store.clearDirty(["trips.json"]);
    expect(await check(mac.store, mac.c)).toBe("pulled");
    expect(((await mac.store.get("trips.json")) as unknown as TripsFile).trips[0]?.name).toBe("Renamed");
  });

  it("'keep remote' in a conflict also keeps the trips and marks the file for the next push", async () => {
    await setup();
    const win = await dev("win");
    await addEntry(win.store, { kind: "expense", currency: "PHP", date: "2026-10-03", amount: 100, category: "Food" });
    expect(await check(win.store, win.c)).toBe("conflict");
    await resolve(win.store, win.c, "remote", () => {});
    expect(((await win.store.get("trips.json")) as unknown as TripsFile).trips).toHaveLength(1);
    expect(await win.store.dirtyPaths()).toEqual(["trips.json"]);
  });

  it("'merge' in a conflict keeps the trips from the repo", async () => {
    await setup();
    const win = await dev("win");
    await addEntry(win.store, { kind: "expense", currency: "PHP", date: "2026-10-03", amount: 100, category: "Food" });
    await resolve(win.store, win.c, "merge", () => {});
    expect(((await win.store.get("trips.json")) as unknown as TripsFile).tripItems).toHaveLength(1);
    expect(await win.store.dirtyPaths()).toContain("trips.json");
  });

  it("an unreadable file is left alone and the pull still works", async () => {
    await setup();
    const t = gh.trees.get(gh.commits.get(gh.head)!.tree)!;
    const bad = "b" + "9".repeat(39);
    gh.blobs.set(bad, "not json {");
    t.set("trips.json", bad);
    const win = await dev("win");
    expect(await check(win.store, win.c)).toBe("pulled");
    expect(await win.store.get("trips.json")).toBeUndefined();
  });
});

describe("export and import", () => {
  const good = { trips: [trip()], tripItems: [item(), item({ id: "i2", refund: true, refundOf: "i1", final: 200000 })] };

  it("exports trips.json and imports it into an empty device", async () => {
    const a = await dev("a");
    const b = await dev("b");
    await put(a.store, good);
    const bundle = await exportBundle(a.store);
    expect(Object.keys(bundle.files)).toEqual(["trips.json"]);
    expect(validateBundle(bundle)).toEqual([]);
    expect(await importBundle(b.store, bundle)).toMatchObject({ files: 1 });
    expect(await b.store.get("trips.json")).toEqual(good);
    expect(await b.store.dirtyPaths()).toEqual(["trips.json"]);
  });

  it("rejects a bad trip or item with a clear reason", () => {
    const bad = (f: unknown) => validateBundle({ format: "ledger-export", version: 1, exportedAt: "", files: { "trips.json": f as Record<string, unknown> } });
    expect(bad({ trips: [trip({ days: 0 })], tripItems: [] })[0]).toBe("trips.json trip 1: bad days");
    expect(bad({ trips: [trip({ status: "done" as never })], tripItems: [] })[0]).toBe("trips.json trip 1: bad status");
    expect(bad({ trips: [trip({ rates: { JPY: "x" } })], tripItems: [] })[0]).toBe("trips.json trip 1: bad rates");
    expect(bad({ trips: [], tripItems: [item({ amount: 0 })] })[0]).toBe("trips.json item 1: bad amount");
    expect(bad({ trips: [], tripItems: [item({ final: -5 })] })[0]).toBe("trips.json item 1: bad final amount");
    expect(bad({ trips: [] })[0]).toBe("trips.json: no tripItems list");
    expect(bad({ tripItems: [] })[0]).toBe("trips.json: no trips list");
  });
});

describe("tripId and local on an entry", () => {
  const base = { kind: "expense" as const, currency: "PHP", date: "2026-10-03", amount: 456789, category: "Food" };

  it("survive an edit and a month round trip", async () => {
    const s = await LedgerStore.open(`e-${n++}`);
    const e = await addEntry(s, { ...base, tripId: "t1", local: { amount: 1234500, currency: "JPY" } });
    await updateEntry(s, "2026-10", e.id, { note: "Dinner" });
    expect((await listMonth(s, "2026-10"))[0]).toMatchObject({ tripId: "t1", local: { amount: 1234500, currency: "JPY" }, note: "Dinner" });
  });

  it("are checked on import", () => {
    const entry = (extra: Record<string, unknown>) => ({ id: "e1", kind: "expense", date: "2026-10-03", amount: 100, currency: "PHP", createdAt: T, updatedAt: T, ...extra });
    const run = (extra: Record<string, unknown>) => validateBundle({ format: "ledger-export", version: 1, exportedAt: "", files: { "months/2026-10.json": { month: "2026-10", entries: [entry(extra)] } } });
    expect(run({ tripId: "t1", local: { amount: 5, currency: "JPY" } })).toEqual([]);
    expect(run({ tripId: 5 })[0]).toContain("bad tripId");
    expect(run({ local: { amount: 0, currency: "JPY" } })[0]).toContain("bad local amount");
    expect(run({ local: { amount: 5, currency: "yen!" } })[0]).toContain("bad local amount");
  });
});
