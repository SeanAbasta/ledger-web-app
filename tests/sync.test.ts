import { beforeEach, describe, expect, it } from "vitest";
import { LedgerStore } from "../src/data/db";
import { addEntry, listMonth } from "../src/data/months";
import { upsert, list } from "../src/data/collections";
import { GitHubApi, GitHubError } from "../src/sync/github";
import { ChecksumError, check, push, resolve, verify, type Ctx } from "../src/sync/handoff";
import { mergeDocs } from "../src/sync/merge";
import { FakeGitHub } from "./helpers/fakeGithub";
import type { Bundle } from "../src/data/bundle";

let gh: FakeGitHub;
let n = 0;
const api = (token = "good", g = gh) => new GitHubApi({ token, owner: "me", repo: "data", fetch: g.fetch, now: () => 1_000_000 });
const ctx = (device: string, token = "good"): Ctx => ({ api: api(token), device, now: () => new Date("2026-10-07T12:00:00Z") });
const dev = async (name: string) => ({ store: await LedgerStore.open(`${name}-${n++}`), c: ctx(name) });
const exp = { kind: "expense" as const, currency: "PHP", category: "Food" };

beforeEach(() => { gh = new FakeGitHub(); });

describe("handoff", () => {
  it("first device uploads everything with a manifest; second device pulls it", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-10-07", amount: 125000 });
    await upsert(mac.store, "people", { name: "Maya" });
    expect(await check(mac.store, mac.c)).toBe("needs-push");
    expect(await push(mac.store, mac.c)).toMatchObject({ status: "pushed" });
    expect(await mac.store.dirtyPaths()).toEqual([]);
    const files = gh.files();
    expect(Object.keys(files).sort()).toEqual(["README.md", "manifest.json", "months/2026-10.json", "people.json"]);
    expect(JSON.parse(files["manifest.json"]!)).toMatchObject({ revision: 1, updatedBy: "mac" });

    expect(await check(win.store, win.c)).toBe("pulled");
    expect((await listMonth(win.store, "2026-10"))[0]?.amount).toBe(125000);
    expect((await list(win.store, "people"))[0]?.name).toBe("Maya");
    expect(await win.store.dirtyPaths()).toEqual([]);
    expect(await verify(win.store, win.c)).toEqual({ ok: true });
    expect(await check(win.store, win.c)).toBe("up-to-date");
  });

  it("a later change moves across and downloads only the changed file", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-09-01", amount: 100 });
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 200 });
    await push(mac.store, mac.c);
    await check(win.store, win.c);

    await addEntry(mac.store, { ...exp, date: "2026-10-02", amount: 300 });
    expect(await push(mac.store, mac.c)).toMatchObject({ status: "pushed" });
    expect(JSON.parse(gh.files()["manifest.json"]!).revision).toBe(2);

    gh.log = [];
    expect(await check(win.store, win.c)).toBe("pulled");
    expect(gh.log.filter((l) => l.startsWith("GET /git/blobs/")).length).toBe(2); // manifest + the one changed month
    expect((await listMonth(win.store, "2026-10")).map((e) => e.amount).sort()).toEqual([200, 300]);
  });

  it("is a no-op with nothing to push", async () => {
    const mac = await dev("mac");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    await push(mac.store, mac.c);
    expect(await push(mac.store, mac.c)).toEqual({ status: "noop" });
  });

  it("rejects a stale push and leaves the remote untouched", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    await push(mac.store, mac.c);
    await check(win.store, win.c);
    await addEntry(mac.store, { ...exp, date: "2026-10-02", amount: 2 });
    await push(mac.store, mac.c);

    await addEntry(win.store, { ...exp, date: "2026-10-03", amount: 3 }); // win is behind
    const head = gh.head;
    expect(await push(win.store, win.c)).toEqual({ status: "conflict" });
    expect(gh.head).toBe(head);
    expect(await check(win.store, win.c)).toBe("conflict");
    expect(await win.store.dirtyPaths()).toEqual(["months/2026-10.json"]);
  });

  it("catches the branch moving between reading it and updating it", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    await push(mac.store, mac.c);
    await check(win.store, win.c);
    await addEntry(win.store, { ...exp, date: "2026-10-02", amount: 2 });
    let moved = false;
    gh.before = async (m) => {
      if (m === "PATCH" && !moved) {
        moved = true;
        await addEntry(mac.store, { ...exp, date: "2026-10-09", amount: 9 });
        gh.before = undefined;
        await push(mac.store, mac.c);
      }
    };
    expect(await push(win.store, win.c)).toEqual({ status: "conflict" });
    expect(await win.store.dirtyPaths()).toEqual(["months/2026-10.json"]);
  });

  it("keeps changes made while a push is in flight marked as unsynced", async () => {
    const mac = await dev("mac");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    gh.before = async (m) => {
      if (m === "PATCH") {
        gh.before = undefined;
        await addEntry(mac.store, { ...exp, date: "2026-10-05", amount: 5 });
      }
    };
    await push(mac.store, mac.c);
    expect(await mac.store.dirtyPaths()).toEqual(["months/2026-10.json"]);
    await push(mac.store, mac.c);
    expect(await mac.store.dirtyPaths()).toEqual([]);
    expect(JSON.parse(gh.files()["months/2026-10.json"]!).entries).toHaveLength(2);
  });

  it("a failed push leaves everything local and unsynced", async () => {
    const mac = await dev("mac");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    gh.fail = { match: /POST \/git\/trees/, status: 500, times: 1 };
    await expect(push(mac.store, mac.c)).rejects.toBeInstanceOf(GitHubError);
    expect(await mac.store.dirtyPaths()).toEqual(["months/2026-10.json"]);
    expect(Object.keys(gh.files())).toEqual(["README.md"]);
    expect(await push(mac.store, mac.c)).toMatchObject({ status: "pushed" });
  });

  it("refuses to unlock on a checksum mismatch and keeps local data", async () => {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    await push(mac.store, mac.c);
    const t = gh.trees.get(gh.commits.get(gh.head)!.tree)!;
    gh.blobs.set(t.get("months/2026-10.json")!, '{"month":"2026-10","entries":[]}\n'); // tampered
    await expect(check(win.store, win.c)).rejects.toBeInstanceOf(ChecksumError);
    expect(await listMonth(win.store, "2026-10")).toEqual([]);
  });
});

describe("verify", () => {
  it("fails while changes are unsynced and when the remote differs", async () => {
    const mac = await dev("mac");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    expect(await verify(mac.store, mac.c)).toEqual({ ok: false, reason: "unsynced" });
    await push(mac.store, mac.c);
    expect(await verify(mac.store, mac.c)).toEqual({ ok: true });
    const other = await dev("win");
    await check(other.store, other.c);
    await addEntry(other.store, { ...exp, date: "2026-10-02", amount: 2 });
    await push(other.store, other.c);
    expect(await verify(mac.store, mac.c)).toEqual({ ok: false, reason: "behind" });
  });
  it("accepts a newer commit that did not change the data", async () => {
    const mac = await dev("mac");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 1 });
    await push(mac.store, mac.c);
    const t = new Map(gh.trees.get(gh.commits.get(gh.head)!.tree)!);
    gh.blobs.set("readme2", "edited");
    t.set("README.md", "readme2");
    gh.trees.set("t99", t);
    gh.commits.set("c99", { tree: "t99", parents: [gh.head] });
    gh.head = "c99";
    expect(await verify(mac.store, mac.c)).toEqual({ ok: true });
    expect(await check(mac.store, mac.c)).toBe("up-to-date");
  });
});

describe("resolve", () => {
  async function conflict() {
    const mac = await dev("mac");
    const win = await dev("win");
    await addEntry(mac.store, { ...exp, date: "2026-10-01", amount: 100 });
    await push(mac.store, mac.c);
    await check(win.store, win.c);
    await addEntry(mac.store, { ...exp, date: "2026-10-02", amount: 200 }); // mac moves on
    await upsert(mac.store, "people", { name: "Maya" });
    await push(mac.store, mac.c);
    await addEntry(win.store, { ...exp, date: "2026-10-03", amount: 300 }); // win edits stale
    expect(await check(win.store, win.c)).toBe("conflict");
    return { mac, win };
  }
  const saved: [string, Bundle][] = [];
  const save = (n: string, b: Bundle) => saved.push([n, b]);
  beforeEach(() => { saved.length = 0; });
  const amounts = async (s: LedgerStore) => (await listMonth(s, "2026-10")).map((e) => e.amount).sort((a, b) => a - b);

  it("keep remote: replaces local, saves this device's version first", async () => {
    const { win } = await conflict();
    await resolve(win.store, win.c, "remote", save);
    expect(await amounts(win.store)).toEqual([100, 200]);
    expect(await win.store.dirtyPaths()).toEqual([]);
    expect(saved.map(([n]) => n)).toEqual(["this-device-version"]);
    expect(Object.values(saved[0]![1].files["months/2026-10.json"]!.entries as { amount: number }[]).map((e) => e.amount)).toContain(300);
    expect(await verify(win.store, win.c)).toEqual({ ok: true });
  });
  it("keep this device: remote-only data is removed and the remote ends up equal to local", async () => {
    const { win } = await conflict();
    const { deletions } = await resolve(win.store, win.c, "local", save);
    expect(deletions).toEqual(["people.json"]);
    expect(await push(win.store, win.c, { deletions })).toMatchObject({ status: "pushed" });
    expect(Object.keys(gh.files()).sort()).toEqual(["README.md", "manifest.json", "months/2026-10.json"]);
    expect(JSON.parse(gh.files()["months/2026-10.json"]!).entries.map((e: { amount: number }) => e.amount).sort()).toEqual([100, 300]);
    expect(saved.map(([n]) => n)).toEqual(["remote-version"]);
    expect(await verify(win.store, win.c)).toEqual({ ok: true });
  });
  it("merge: keeps both sides' entries, saves both versions, then pushes cleanly", async () => {
    const { mac, win } = await conflict();
    await resolve(win.store, win.c, "merge", save);
    expect(saved.map(([n]) => n).sort()).toEqual(["remote-version", "this-device-version"]);
    expect(await amounts(win.store)).toEqual([100, 200, 300]);
    expect(await push(win.store, win.c)).toMatchObject({ status: "pushed" });
    expect(await check(mac.store, mac.c)).toBe("pulled");
    expect(await amounts(mac.store)).toEqual([100, 200, 300]);
    expect((await list(mac.store, "people"))[0]?.name).toBe("Maya");
  });
});

describe("errors", () => {
  it("maps statuses to kinds", async () => {
    const s = (await dev("x")).store;
    const kind = async (c: Ctx) => { try { await check(s, c); return "none"; } catch (e) { return (e as GitHubError).kind; } };
    expect(await kind(ctx("x", "bad"))).toBe("auth");
    gh.offline = true;
    expect(await kind(ctx("x"))).toBe("network");
    gh.offline = false;
    gh.fail = { match: /GET/, status: 403, message: "Resource not accessible", times: 1 };
    expect(await kind(ctx("x"))).toBe("forbidden");
    gh.fail = { match: /GET/, status: 404, times: 1 };
    expect(await kind(ctx("x"))).toBe("notfound");
  });
  it("reads rate limit headers", async () => {
    const s = (await dev("x")).store;
    gh.fail = { match: /GET/, status: 403, headers: { "retry-after": "30" }, times: 1 };
    await expect(check(s, ctx("x"))).rejects.toMatchObject({ kind: "rate", retryAt: 1_000_000 + 30_000 });
    gh.fail = { match: /GET/, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "2000" }, times: 1 };
    await expect(check(s, ctx("x"))).rejects.toMatchObject({ kind: "rate", retryAt: 2_000_000 });
    gh.fail = { match: /GET/, status: 429, times: 1 };
    await expect(check(s, ctx("x"))).rejects.toMatchObject({ kind: "rate", retryAt: 1_000_000 + 60_000 });
  });
  it("sends requests one at a time, with the token only in the header", async () => {
    let inflight = 0;
    let max = 0;
    const slow: typeof fetch = async (i, init) => { inflight++; max = Math.max(max, inflight); await new Promise((r) => setTimeout(r, 2)); inflight--; return gh.fetch(i, init); };
    const a = new GitHubApi({ token: "good", owner: "me", repo: "data", fetch: slow });
    await Promise.all([a.getHead(), a.getHead(), a.getHead()]);
    expect(max).toBe(1);
  });
});

describe("mergeDocs", () => {
  const e = (id: string, updatedAt: string, amount = 1, deleted?: true) => ({ id, updatedAt, amount, ...(deleted ? { deleted } : {}) });
  it("newest edit wins per entry; a newer tombstone beats an older edit", () => {
    const m = mergeDocs("months/2026-10.json", { month: "2026-10", entries: [e("a", "2", 5), e("b", "5", 1, true), e("c", "1")] }, { month: "2026-10", entries: [e("a", "1", 9), e("b", "3", 7), e("d", "1")] });
    expect((m.entries as { id: string; amount: number; deleted?: boolean }[]).map((x) => [x.id, x.amount, !!x.deleted])).toEqual([["a", 5, false], ["b", 1, true], ["c", 1, false], ["d", 1, false]]);
  });
  it("merges lists, unions categories, tolerates a missing side", () => {
    expect(mergeDocs("people.json", { people: [e("a", "1")] }, { people: [e("b", "1")] }).people).toHaveLength(2);
    expect(mergeDocs("settings.json", { categories: ["A", "B"], defaultCurrency: "USD" }, { categories: ["B", "C"], defaultCurrency: "PHP" })).toMatchObject({ categories: ["B", "C", "A"], defaultCurrency: "USD" });
    expect(mergeDocs("rules.json", undefined, { rules: [] })).toEqual({ rules: [] });
  });
});
