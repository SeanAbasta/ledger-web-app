import { beforeEach, describe, expect, it } from "vitest";
import { LedgerStore } from "../src/data/db";
import { addEntry, listMonth } from "../src/data/months";
import { SyncEngine, type SyncStatus } from "../src/sync/engine";
import { GitHubApi } from "../src/sync/github";
import type { Ctx } from "../src/sync/handoff";
import { FakeGitHub } from "./helpers/fakeGithub";

let gh: FakeGitHub;
let n = 0;
const exp = { kind: "expense" as const, currency: "PHP", category: "Food" };
const mk = async (name: string, token = "good") => {
  const store = await LedgerStore.open(`${name}-${n++}`);
  const ctx: Ctx = { api: new GitHubApi({ token, owner: "o", repo: "r", fetch: gh.fetch, now: () => 1_000 }), device: name };
  const timers: { fn: () => void; ms: number }[] = [];
  const backups: string[] = [];
  let changes = 0;
  const e = new SyncEngine(store, {
    ctx, saveBackup: (b) => backups.push(b), onDataChanged: () => changes++, now: () => 1_000,
    schedule: (fn, ms) => { const t = { fn, ms }; timers.push(t); return () => { t.fn = () => {}; }; },
  });
  const states: string[] = [];
  e.subscribe((s: SyncStatus) => states.push(s.state));
  return { store, e, timers, states, backups, changes: () => changes };
};

beforeEach(() => { gh = new FakeGitHub(); });

describe("SyncEngine", () => {
  it("starts unconfigured without a context", async () => {
    const store = await LedgerStore.open(`none-${n++}`);
    const e = new SyncEngine(store, { ctx: null, saveBackup: () => {} });
    expect(e.status.state).toBe("unconfigured");
    await e.open();
    expect(e.status.state).toBe("unconfigured");
  });

  it("open: checks, then shows synced; a pull reloads the screens", async () => {
    const a = await mk("a");
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    await a.e.open();
    expect(a.e.status.state).toBe("synced");
    expect(a.states).toContain("checking");
    expect(Object.keys(gh.files())).toContain("manifest.json");
    const b = await mk("b");
    await b.e.open();
    expect(b.changes()).toBe(1);
    expect((await listMonth(b.store, "2026-10"))).toHaveLength(1);
    expect(b.e.hasUnsynced).toBe(false);
  });

  it("a local write goes needs-sync, then pushes after the debounce", async () => {
    const a = await mk("a");
    await a.e.open();
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    a.e.changed();
    expect(a.e.status.state).toBe("needs-sync");
    expect(a.e.hasUnsynced).toBe(true);
    expect(a.timers.at(-1)!.ms).toBe(7000);
    a.timers.at(-1)!.fn();
    await a.e.flush(); // waits behind the queued push
    expect(a.e.status.state).toBe("synced");
    expect(a.e.hasUnsynced).toBe(false);
  });

  it("syncNow is only safe to close after the remote matches", async () => {
    const a = await mk("a");
    await a.e.open();
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    a.e.changed();
    expect(await a.e.syncNow()).toEqual({ safeToClose: true });
    expect(a.e.status.state).toBe("synced");
    const files = gh.files();
    expect(JSON.parse(files["months/2026-10.json"]!).entries).toHaveLength(1);
  });

  it("offline: edits stay unsynced and are never reported safe; coming back syncs them", async () => {
    const a = await mk("a");
    await a.e.open();
    gh.offline = true;
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    a.e.changed();
    expect(await a.e.syncNow()).toEqual({ safeToClose: false });
    expect(a.e.status.state).toBe("offline");
    expect(a.e.hasUnsynced).toBe(true);
    gh.offline = false;
    await a.e.open();
    expect(a.e.status.state).toBe("synced");
    expect(a.e.hasUnsynced).toBe(false);
  });

  it("rate limit pauses and retries later without losing changes", async () => {
    const a = await mk("a");
    await a.e.open();
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    a.e.changed();
    gh.fail = { match: /GET \/git\/ref/, status: 429, headers: { "retry-after": "30" }, times: 1 };
    await a.e.flush();
    expect(a.e.status).toMatchObject({ state: "needs-sync", retryAt: 31_000 });
    expect(a.timers.at(-1)!.ms).toBe(30_000);
    a.timers.at(-1)!.fn();
    await a.e.flush();
    expect(a.e.status.state).toBe("synced");
  });

  it("bad token shows an error and keeps data", async () => {
    const a = await mk("a", "bad");
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    await a.e.open();
    expect(a.e.status).toMatchObject({ state: "error", message: expect.stringMatching(/Token/) });
    expect(a.e.hasUnsynced).toBe(true);
  });

  it("conflict blocks syncing until resolved, then pushes", async () => {
    const a = await mk("a");
    const b = await mk("b");
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 100 });
    await a.e.open();
    await b.e.open();
    await addEntry(a.store, { ...exp, date: "2026-10-02", amount: 200 });
    a.e.changed();
    await a.e.syncNow();
    await addEntry(b.store, { ...exp, date: "2026-10-03", amount: 300 });
    b.e.changed();
    await b.e.flush();
    expect(b.e.status.state).toBe("conflict");
    expect(b.e.readOnly).toBe(true);
    expect(await b.e.syncNow()).toEqual({ safeToClose: false });
    await b.e.resolve("merge");
    expect(b.e.status.state).toBe("synced");
    expect(b.backups.sort()).toEqual(["remote-version", "this-device-version"]);
    expect((await listMonth(b.store, "2026-10")).map((e) => e.amount).sort((x, y) => x - y)).toEqual([100, 200, 300]);
    expect(await b.e.syncNow()).toEqual({ safeToClose: true });
  });

  it("verification failure after a tampered download leaves data untouched", async () => {
    const a = await mk("a");
    await addEntry(a.store, { ...exp, date: "2026-10-01", amount: 1 });
    await a.e.open();
    const t = gh.trees.get(gh.commits.get(gh.head)!.tree)!;
    gh.blobs.set(t.get("months/2026-10.json")!, "{}\n");
    const b = await mk("b");
    await b.e.open();
    expect(b.e.status).toMatchObject({ state: "error", message: expect.stringMatching(/verification/) });
    expect(await listMonth(b.store, "2026-10")).toEqual([]);
  });
});
