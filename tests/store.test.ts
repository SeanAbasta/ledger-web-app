import { beforeEach, describe, expect, it } from "vitest";
import { getSettings, list, remove, saveSettings, upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { addEntry, deleteEntry, listMonth, listMonthKeys, updateEntry } from "../src/data/months";

let store: LedgerStore;
let n = 0;
beforeEach(async () => {
  store = await LedgerStore.open(`test-${n++}`);
});

const base = { kind: "expense" as const, currency: "PHP", category: "Food" };

describe("months", () => {
  it("adds entries to the right month file and marks it dirty", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 125000 });
    expect(e.id).toHaveLength(26);
    expect(await store.dirtyPaths()).toEqual(["months/2026-10.json"]);
    expect((await listMonth(store, "2026-10")).map((x) => x.id)).toEqual([e.id]);
    expect(await listMonthKeys(store)).toEqual(["2026-10"]);
  });

  it("rejects floats, non-positive amounts and bad dates", async () => {
    await expect(addEntry(store, { ...base, date: "2026-10-07", amount: 12.5 })).rejects.toThrow();
    await expect(addEntry(store, { ...base, date: "2026-10-07", amount: 0 })).rejects.toThrow();
    await expect(addEntry(store, { ...base, date: "10/07/2026", amount: 100 })).rejects.toThrow();
    expect(await store.dirtyPaths()).toEqual([]);
  });

  it("sorts newest first", async () => {
    await addEntry(store, { ...base, date: "2026-10-02", amount: 100 });
    await addEntry(store, { ...base, date: "2026-10-09", amount: 200 });
    expect((await listMonth(store, "2026-10")).map((e) => e.date)).toEqual(["2026-10-09", "2026-10-02"]);
  });

  it("updates in place and moves across months with a tombstone", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    const u = await updateEntry(store, "2026-10", e.id, { amount: 250 });
    expect(u.amount).toBe(250);
    const moved = await updateEntry(store, "2026-10", e.id, { date: "2026-11-01" });
    expect(await listMonth(store, "2026-10")).toEqual([]);
    expect((await listMonth(store, "2026-11")).map((x) => x.id)).toEqual([moved.id]);
    const raw = await store.get<{ entries: { deleted?: boolean }[] }>("months/2026-10.json");
    expect(raw?.entries[0]?.deleted).toBe(true);
  });

  it("deletes with a tombstone", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    await deleteEntry(store, "2026-10", e.id);
    expect(await listMonth(store, "2026-10")).toEqual([]);
    await expect(deleteEntry(store, "2026-10", "nope")).rejects.toThrow();
  });

  it("a failed transaction leaves nothing half-written", async () => {
    const e = await addEntry(store, { ...base, date: "2026-10-07", amount: 100 });
    await store.clearDirty(["months/2026-10.json"]);
    await expect(updateEntry(store, "2026-10", e.id, { date: "2026-11-01", amount: -5 })).rejects.toThrow();
    expect(await store.dirtyPaths()).toEqual([]);
    expect(await listMonthKeys(store)).toEqual(["2026-10"]);
    expect((await listMonth(store, "2026-10"))[0]?.amount).toBe(100);
  });
});

describe("collections and settings", () => {
  it("upserts, lists and tombstones people", async () => {
    const maya = await upsert(store, "people", { name: "Maya" });
    await upsert(store, "people", { name: "Jon" });
    await upsert(store, "people", { id: maya.id, name: "Maya R." });
    expect((await list(store, "people")).map((p) => p.name).sort()).toEqual(["Jon", "Maya R."]);
    await remove(store, "people", maya.id);
    expect((await list(store, "people")).map((p) => p.name)).toEqual(["Jon"]);
    expect(await store.dirtyPaths()).toContain("people.json");
  });

  it("defaults settings to PHP and saves patches", async () => {
    expect((await getSettings(store)).baseCurrency).toBe("PHP");
    await saveSettings(store, { defaultCurrency: "USD" });
    const s = await getSettings(store);
    expect(s.defaultCurrency).toBe("USD");
    expect(s.baseCurrency).toBe("PHP");
  });

  it("putRemote does not mark dirty and clears stale dirty flags", async () => {
    await upsert(store, "people", { name: "Maya" });
    await store.putRemote({ "people.json": { people: [] } });
    expect(await store.dirtyPaths()).toEqual([]);
    expect(await list(store, "people")).toEqual([]);
  });
});
