import { beforeEach, describe, expect, it } from "vitest";
import { LedgerStore } from "../src/data/db";
import { addEntry, deleteEntry, listMonth, restoreEntry } from "../src/data/months";
import type { Entry } from "../src/data/schema";
import { mergeDocs } from "../src/sync/merge";

let store: LedgerStore;
let n = 0;
beforeEach(async () => {
  store = await LedgerStore.open(`restore-${n++}`);
});
const base = { kind: "expense" as const, currency: "PHP", category: "Food", note: "Dinner" };
const raw = async (m: string) => (await store.get<{ entries: Entry[] }>(`months/${m}.json`))!.entries;

describe("restoreEntry (Undo of Delete)", () => {
  it("round trip: delete, then restore, gives the entry back as it was", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 120000 });
    await deleteEntry(store, "2026-10", e.id);
    await store.clearDirty(["months/2026-10.json"]);
    const back = await restoreEntry(store, "2026-10", e.id);
    const live = await listMonth(store, "2026-10");
    expect(live.map((x) => x.id)).toEqual([e.id]);
    expect({ ...live[0], updatedAt: "" }).toEqual({ ...e, updatedAt: "" });
    expect("deleted" in live[0]!).toBe(false);
    expect(back.id).toBe(e.id);
    expect(await store.dirtyPaths()).toEqual(["months/2026-10.json"]); // the restore is one more push
  });

  it("the edit time moves forward past the tombstone, even within the same millisecond", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    await deleteEntry(store, "2026-10", e.id);
    const tomb = (await raw("2026-10"))[0]!;
    await restoreEntry(store, "2026-10", e.id);
    const after = (await raw("2026-10"))[0]!;
    expect(after.updatedAt > tomb.updatedAt).toBe(true);
  });

  it("after a push, the restored entry wins a merge with the other side's tombstone (newest edit wins)", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    await deleteEntry(store, "2026-10", e.id);
    const pushed = { month: "2026-10", entries: await raw("2026-10") }; // what GitHub holds: the tombstone
    await restoreEntry(store, "2026-10", e.id);
    const local = { month: "2026-10", entries: await raw("2026-10") };
    const merged = mergeDocs("months/2026-10.json", local, pushed) as { entries: Entry[] };
    expect(merged.entries[0]!.deleted).toBeUndefined();
    expect(mergeDocs("months/2026-10.json", pushed, local) as unknown).toEqual(merged);
  });

  it("only a deleted entry can be restored", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    await expect(restoreEntry(store, "2026-10", e.id)).rejects.toThrow();
    await expect(restoreEntry(store, "2026-10", "nope")).rejects.toThrow();
  });
});
