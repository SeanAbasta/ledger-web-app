import { beforeEach, describe, expect, it } from "vitest";
import { moveAndRemove } from "../src/data/accountMove";
import { accountBalances } from "../src/data/accounts";
import { personLines } from "../src/data/balances";
import { upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { forecast } from "../src/data/forecast";
import { addEntry, deleteEntry, loadAllEntries, updateEntry } from "../src/data/months";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry } from "../src/data/schema";
import { plannedSummary, summarize } from "../src/data/summary";
import { newTransfer, transferSources, transferTargets } from "../src/data/transfers";
import { categoryTone } from "../src/ui/categoryColor";
import { itemsToDate } from "../src/data/world";

const bankA: Account = { id: "A1", name: "Bank A", currency: "PHP", openingBalance: 1000000, updatedAt: "x" };
const bankB: Account = { id: "A2", name: "Bank B", currency: "PHP", openingBalance: 500000, updatedAt: "x" };
const bankC: Account = { id: "A3", name: "Bank C", currency: "USD", openingBalance: 100000, rate: "56", updatedAt: "x" };
const bankD: Account = { id: "A4", name: "Bank D", currency: "PHP", openingBalance: 0, updatedAt: "x" };
const cardA: Account = { id: "C1", name: "Card A", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, updatedAt: "x" };
const all = [bankA, bankB, bankC, cardA];
const asEntry = (n: ReturnType<typeof newTransfer>, id = "t1"): Entry => ({ ...n, id, createdAt: "x", updatedAt: "x" });

let store: LedgerStore;
let n = 0;
beforeEach(async () => { store = await LedgerStore.open(`bt-${n++}`); });

describe("bank to bank transfers", () => {
  it("offers bank accounts with a partner in the same currency, never cards", () => {
    expect(transferSources(all).map((a) => a.id)).toEqual(["A1", "A2"]); // Bank C is the only USD account
    expect(transferTargets(all, "A1").map((a) => a.id)).toEqual(["A2"]);
    expect(transferTargets(all, "A3")).toEqual([]);
    expect(transferSources([bankA, cardA])).toEqual([]); // fewer than two banks: the form shows a hint
    expect(transferSources([bankA, { ...bankB, deleted: true as const }])).toEqual([]);
  });

  it("refuses the same account twice, a card, and two currencies", () => {
    expect(() => newTransfer({ amount: 100, from: bankA, to: bankA, date: "2026-10-10" })).toThrow("two different accounts");
    expect(() => newTransfer({ amount: 100, from: bankA, to: cardA, date: "2026-10-10" })).toThrow("bank accounts");
    expect(() => newTransfer({ amount: 100, from: bankA, to: bankC, date: "2026-10-10" })).toThrow("same currency");
    expect(newTransfer({ amount: 100, from: bankA, to: bankB, date: "2026-10-10", note: " Savings " })).toEqual({
      kind: "transfer", category: "Transfer", amount: 100, currency: "PHP", date: "2026-10-10", note: "Savings", accountId: "A1", toAccountId: "A2",
    });
  });

  it("moves balances by exactly the amount and leaves the total alone", () => {
    const t = asEntry(newTransfer({ amount: 200000, from: bankA, to: bankB, date: "2026-10-10" }));
    const before = accountBalances(all, ledgerItems([], [], "0000-01-01", "2026-10-31"), "PHP");
    const after = accountBalances(all, ledgerItems([t], [], "0000-01-01", "2026-10-31"), "PHP");
    expect(after.accounts.map((a) => a.balance)).toEqual([800000, 700000, 100000]);
    expect(after.totalBase).toBe(before.totalBase);
  });

  it("a future-dated transfer changes nothing until its date", () => {
    const t = asEntry(newTransfer({ amount: 200000, from: bankA, to: bankB, date: "2026-11-01" }));
    const w = { entries: [t], rules: [] };
    expect(accountBalances(all, itemsToDate(w, "2026-10-19"), "PHP").accounts.map((a) => a.balance)).toEqual([1000000, 500000, 100000]);
    expect(accountBalances(all, itemsToDate(w, "2026-11-01"), "PHP").accounts.map((a) => a.balance)).toEqual([800000, 700000, 100000]);
  });

  it("is never spending, never in the chart or daily bars, never income in the forecast, never a split line", () => {
    const t = asEntry(newTransfer({ amount: 200000, from: bankA, to: bankB, date: "2026-10-10" }));
    const later = asEntry(newTransfer({ amount: 300000, from: bankB, to: bankA, date: "2026-11-05" }), "t2");
    const s = summarize(ledgerItems([t], [], "2026-10-01", "2026-10-31"), "PHP", "2026-10-01", "2026-10-31");
    expect([s.total, s.byCategory, s.byDay.every((v) => v === 0)]).toEqual([0, [], true]);
    const p = plannedSummary(ledgerItems([later], [], "2026-11-01", "2026-11-30"), "PHP", "2026-11-01", "2026-11-30", "2026-10-19");
    expect([p.total, p.planned]).toEqual([0, 0]);
    const base = forecast({ start: 1500000, today: "2026-10-19", base: "PHP", entries: [], rules: [], months: 3, accounts: all });
    const withT = forecast({ start: 1500000, today: "2026-10-19", base: "PHP", entries: [t, later], rules: [], months: 3, accounts: all });
    expect(withT.months).toEqual(base.months);
    expect(personLines("P1", ledgerItems([t], [], "2026-10-01", "2026-10-31"))).toEqual([]);
  });

  it("is grey like a card payment", () => {
    expect(categoryTone("Transfer")).toBe("gray");
  });

  it("made by the form's helper, it can be edited, deleted, and moved before an account is removed", async () => {
    for (const a of [bankA, bankB, bankD]) await upsert(store, "accounts", a);
    const t = await addEntry(store, newTransfer({ amount: 200000, from: bankA, to: bankB, date: "2026-10-10", note: "Savings" }));
    const edited = await updateEntry(store, "2026-10", t.id, { amount: 250000, date: "2026-11-02", accountId: "A2", toAccountId: "A1" });
    expect(edited).toMatchObject({ kind: "transfer", amount: 250000, accountId: "A2", toAccountId: "A1", note: "Savings" });
    await expect(updateEntry(store, "2026-11", t.id, { toAccountId: "A2" })).rejects.toThrow("two different accounts");
    // Removing Bank A moves the transfer's end to Bank D; moving it to Bank B would make a self transfer, which is kept.
    expect(await moveAndRemove(store, "A1", "A4")).toMatchObject({ entries: 1, kept: 0 });
    let live = (await loadAllEntries(store)).filter((e) => !e.deleted);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ accountId: "A2", toAccountId: "A4" });
    expect(await moveAndRemove(store, "A4", "A2")).toMatchObject({ entries: 0, kept: 1 });
    await deleteEntry(store, "2026-11", t.id);
    live = (await loadAllEntries(store)).filter((e) => !e.deleted);
    expect(live).toEqual([]);
  });
});
