import { beforeEach, describe, expect, it } from "vitest";
import { makeBundle, parseBundle, bundleText } from "../src/data/bundle";
import { upsert, list } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { csvCell, entriesCsv, exportBundle, importBundle, validateBundle } from "../src/data/exportImport";
import { addEntry, listMonth } from "../src/data/months";
import type { Entry } from "../src/data/schema";

let store: LedgerStore;
let n = 0;
beforeEach(async () => { store = await LedgerStore.open(`ei-${n++}`); });
const exp = { kind: "expense" as const, currency: "PHP", category: "Food" };

describe("export and import", () => {
  it("round-trips through text into an empty device and marks everything for sync", async () => {
    await addEntry(store, { ...exp, date: "2026-10-07", amount: 125050, note: "Dinner" });
    await upsert(store, "people", { name: "Maya" });
    const text = bundleText(await exportBundle(store));
    const other = await LedgerStore.open(`ei-${n++}`);
    const r = await importBundle(other, parseBundle(text));
    expect(r).toEqual({ files: 2, newEntries: 1 });
    expect((await listMonth(other, "2026-10"))[0]?.note).toBe("Dinner");
    expect((await list(other, "people"))[0]?.name).toBe("Maya");
    expect((await other.dirtyPaths()).sort()).toEqual(["months/2026-10.json", "people.json"]);
  });

  it("merges instead of replacing: keeps local entries, newest edit wins, counts only new ones", async () => {
    const a = await addEntry(store, { ...exp, date: "2026-10-01", amount: 100 });
    const other = await LedgerStore.open(`ei-${n++}`);
    await addEntry(other, { ...exp, date: "2026-10-02", amount: 200 });
    const bundle = await exportBundle(other);
    bundle.files["months/2026-10.json"] = { month: "2026-10", entries: [...(bundle.files["months/2026-10.json"]!.entries as Entry[]), { ...a, amount: 1, updatedAt: "2000-01-01T00:00:00.000Z" }] };
    await importBundle(store, bundle);
    const got = await listMonth(store, "2026-10");
    expect(got.map((e) => e.amount).sort((x, y) => x - y)).toEqual([100, 200]); // older import does not overwrite
  });

  it("rejects files that are not Ledger exports or hold bad data, changing nothing", async () => {
    expect(() => parseBundle("{}")).toThrow();
    expect(() => parseBundle("nope")).toThrow();
    const bad = (files: Record<string, unknown>) => makeBundle(files as never);
    expect(validateBundle(bad({ "evil.json": {} }))[0]).toMatch(/not a Ledger file/);
    expect(validateBundle(bad({ "months/2026-10.json": { entries: [{ id: "x", kind: "expense", date: "2026-10-01", amount: 1.5, currency: "PHP", createdAt: "a", updatedAt: "a" }] } }))[0]).toMatch(/bad amount/);
    expect(validateBundle(bad({ "months/2026-10.json": { entries: [{ id: "x", kind: "expense", date: "2026-11-01", amount: 5, currency: "PHP", createdAt: "a", updatedAt: "a" }] } }))[0]).toMatch(/another month/);
    expect(validateBundle(bad({ "people.json": { people: [{ name: "x" }] } }))[0]).toMatch(/missing id/);
    await expect(importBundle(store, bad({ "months/2026-10.json": { entries: [{}] } }))).rejects.toThrow(/cannot be imported/);
    expect(await store.dirtyPaths()).toEqual([]);
  });
});

describe("csv", () => {
  it("quotes cells and neutralises formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });
  it("writes readable rows with names, decimals and split shares", () => {
    const e = (o: Partial<Entry>): Entry => ({ id: "1", kind: "expense", date: "2026-10-07", amount: 125050, currency: "PHP", category: "Food", createdAt: "x", updatedAt: "x", ...o });
    const csv = entriesCsv(
      [e({ id: "2", note: "Dinner, with Maya", split: { paidBy: "me", mode: "half", shares: [{ personId: "m", amount: 62525 }] }, accountId: "A" }), e({ id: "3", date: "2026-10-01", amount: 500, currency: "JPY", rate: "0.38" }), e({ id: "4", deleted: true })],
      [{ id: "m", name: "Maya", updatedAt: "x" }],
      [{ id: "A", name: "BDO", currency: "PHP", openingBalance: 0, updatedAt: "x" }],
    );
    expect(csv.split("\r\n")).toEqual([
      "date,type,category,note,amount,currency,rate,account,paid_by,split,shares,to_account",
      "2026-10-01,expense,Food,,500,JPY,0.38,,,,,",
      '2026-10-07,expense,Food,"Dinner, with Maya",1250.50,PHP,,BDO,me,half,Maya:625.25,',
      "",
    ]);
  });
});
