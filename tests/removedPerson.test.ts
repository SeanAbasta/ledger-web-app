import { beforeEach, describe, expect, it } from "vitest";
import { list, listAll, nameOf, remove, upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { addEntry, listMonth, updateEntry } from "../src/data/months";
import type { Entry, Person, Split } from "../src/data/schema";
import { keptKey, resolveNames, splitFormOf, splitFromForm } from "../src/data/splitForm";
import { removedInSplit, splitForSave } from "../src/data/splits";

let store: LedgerStore;
let n = 0;
let mom: Person;
let jon: Person;
beforeEach(async () => {
  store = await LedgerStore.open(`removed-${n++}`);
  mom = await upsert(store, "people", { name: "Mom" });
  jon = await upsert(store, "people", { name: "Jon" });
});

const expense = (amount: number, split: Split) => addEntry(store, { kind: "expense", date: "2026-10-09", amount, currency: "PHP", category: "Food", note: "Pizza", split });

/** What the expense form does: open the entry, optionally change something, save it. */
async function openAndSave(e: Entry, change: (f: ReturnType<typeof splitFormOf>) => void = () => {}, amount = e.amount): Promise<Entry> {
  const live = await list(store, "people");
  const form = splitFormOf(e.split!, e.currency, live, await listAll(store, "people"));
  change(form);
  const names = form.names.split(",").map((x) => x.trim()).filter(Boolean);
  const named = await resolveNames(store, names, live);
  const split = splitFromForm(form, named, amount, e.currency, { amount: e.amount, split: e.split! });
  await updateEntry(store, "2026-10", e.id, { amount, split, note: "Pizza night" });
  return (await listMonth(store, "2026-10")).find((x) => x.id === e.id)!;
}

describe("editing a split with someone who was removed", () => {
  it("keeps the same split after opening and saving it unchanged (50/50)", async () => {
    const e = await expense(100001, { paidBy: "me", mode: "half", shares: [{ personId: mom.id, amount: 33334 }, { personId: jon.id, amount: 33333 }] });
    await remove(store, "people", mom.id);
    const saved = await openAndSave(e);
    expect(saved.split).toEqual(e.split);
    expect(saved.note).toBe("Pizza night");
  });

  it("keeps a custom split and an I-owe split where the removed person paid", async () => {
    const c = await expense(90000, { paidBy: "me", mode: "custom", shares: [{ personId: mom.id, amount: 50000 }, { personId: jon.id, amount: 10000 }] });
    const o = await expense(30000, { paidBy: mom.id, mode: "i-owe", shares: [{ personId: "me", amount: 30000 }] });
    await remove(store, "people", mom.id);
    expect((await openAndSave(c)).split).toEqual(c.split);
    expect((await openAndSave(o)).split).toEqual(o.split);
  });

  it("names the removed person from the removed record, else 'Removed person'", async () => {
    const split: Split = { paidBy: "me", mode: "they-owe", shares: [{ personId: mom.id, amount: 100 }, { personId: "GONE", amount: 100 }, { personId: jon.id, amount: 100 }] };
    await remove(store, "people", mom.id);
    const live = await list(store, "people");
    expect(removedInSplit(split, live, await listAll(store, "people"))).toEqual([{ id: mom.id, name: "Mom" }, { id: "GONE", name: "Removed person" }]);
    const f = splitFormOf(split, "PHP", live, await listAll(store, "people"));
    expect(f.names).toBe("Jon"); // only live people can be typed
    expect(f.custom[keptKey(mom.id)]).toBe("1.00");
  });

  it("changing the total recomputes the shares and the removed person stays in", async () => {
    const e = await expense(100000, { paidBy: "me", mode: "half", shares: [{ personId: mom.id, amount: 33334 }, { personId: jon.id, amount: 33333 }] });
    await remove(store, "people", mom.id);
    const saved = await openAndSave(e, () => {}, 120000);
    expect(saved.split!.shares).toEqual([{ personId: mom.id, amount: 40000 }, { personId: jon.id, amount: 40000 }]);
  });

  it("only the removed person's custom share changes when it is edited", async () => {
    const e = await expense(90000, { paidBy: "me", mode: "custom", shares: [{ personId: mom.id, amount: 50000 }, { personId: jon.id, amount: 10000 }] });
    await remove(store, "people", mom.id);
    const saved = await openAndSave(e, (f) => { f.custom[keptKey(mom.id)] = "400"; });
    expect(saved.split!.shares).toEqual([{ personId: mom.id, amount: 40000 }, { personId: jon.id, amount: 10000 }]);
  });
});

describe("names in the Ledger", () => {
  it("names a removed person or account with (removed), and something with no record at all by the fallback", async () => {
    const bank = await upsert(store, "accounts", { name: "Old wallet", currency: "PHP", openingBalance: 0 });
    await remove(store, "people", mom.id);
    await remove(store, "accounts", bank.id);
    const people = await listAll(store, "people");
    expect(nameOf(mom.id, people, "Removed person")).toBe("Mom (removed)");
    expect(nameOf(jon.id, people, "Removed person")).toBe("Jon");
    expect(nameOf("GONE", people, "Removed person")).toBe("Removed person");
    expect(nameOf(bank.id, await listAll(store, "accounts"), "Removed account")).toBe("Old wallet (removed)");
    expect(nameOf(undefined, people, "Removed account")).toBe("Removed account");
  });
});

describe("saving a split", () => {
  it("returns the stored split untouched when nothing about it changed", () => {
    const original: Split = { paidBy: "me", mode: "half", shares: [{ personId: "b", amount: 34 }, { personId: "a", amount: 33 }] };
    const same = splitForSave({ original: { amount: 101, split: original }, amount: 101, paidBy: "me", mode: "half", people: ["a", "b"] });
    expect(same).toBe(original);
  });
  it("keeps the original order when rebuilding, so spare centavos go to the same people", () => {
    const original: Split = { paidBy: "me", mode: "they-owe", shares: [{ personId: "b", amount: 51 }, { personId: "a", amount: 50 }] };
    const out = splitForSave({ original: { amount: 101, split: original }, amount: 103, paidBy: "me", mode: "they-owe", people: ["a", "b", "c"] });
    expect(out.shares).toEqual([{ personId: "b", amount: 35 }, { personId: "a", amount: 34 }, { personId: "c", amount: 34 }]);
  });
});
