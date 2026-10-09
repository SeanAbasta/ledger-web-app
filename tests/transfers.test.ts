import { beforeEach, describe, expect, it } from "vitest";
import { accountBalances } from "../src/data/accounts";
import { personLines } from "../src/data/balances";
import { makeBundle } from "../src/data/bundle";
import { list } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { entriesCsv, importBundle, validateBundle } from "../src/data/exportImport";
import { forecast } from "../src/data/forecast";
import { addEntry, addRefund, loadAllEntries, refundable, updateEntry } from "../src/data/months";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry } from "../src/data/schema";
import { summarize } from "../src/data/summary";
import { mergeDocs } from "../src/sync/merge";

const P = 100; // centavos per peso
const e = (id: string, date: string, pesos: number, extra: Partial<Entry> = {}): Entry => ({
  id, kind: "expense", date, amount: pesos * P, currency: "PHP", category: "Food", createdAt: "x", updatedAt: "x", ...extra,
});
const bank: Account = { id: "B", name: "BDO", currency: "PHP", openingBalance: 50000 * P, updatedAt: "x" };
const card: Account = { id: "C", name: "Visa", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, dueDays: 20, limit: 100000 * P, updatedAt: "x" };
const items = (entries: Entry[], to = "2026-12-31") => ledgerItems(entries, [], "0000-01-01", to);

let store: LedgerStore;
let n = 0;
beforeEach(async () => { store = await LedgerStore.open(`tr-${n++}`); });

describe("transfers", () => {
  const charge = e("c1", "2026-11-03", 7000, { accountId: "C" });
  const pay = e("t1", "2026-12-05", 7000, { kind: "transfer", accountId: "B", toAccountId: "C", category: "Card payment" });

  it("moves money from the bank to the card and leaves cards out of the cash total", () => {
    const before = accountBalances([bank, card], items([charge]), "PHP");
    expect(before.accounts.map((a) => a.account.id)).toEqual(["B"]);
    expect(before.cards[0]!.balance).toBe(-7000 * P);
    expect(before.totalBase).toBe(50000 * P); // the swipe did not touch the bank
    const after = accountBalances([bank, card], items([charge, pay]), "PHP");
    expect(after.accounts[0]!.balance).toBe(43000 * P);
    expect(after.cards[0]!.balance).toBe(0);
    expect(after.totalBase).toBe(43000 * P);
  });

  it("is not spending and not a split line", () => {
    const s = summarize(items([charge, pay]), "PHP", "2026-11-01", "2026-12-31");
    expect(s.total).toBe(7000 * P);
    expect(s.byCategory.map((c) => c.category)).toEqual(["Food"]);
    expect(personLines("m", items([pay]))).toEqual([]);
  });

  it("is not income or spending in the forecast", () => {
    const base = { start: 0, today: "2026-11-16", base: "PHP", rules: [], months: 2 };
    expect(forecast({ ...base, entries: [e("t2", "2026-12-05", 7000, { kind: "transfer", accountId: "B", toAccountId: "C" })] }).months.map((m) => m.end)).toEqual([0, 0]);
  });

  it("must have two different accounts and no split", async () => {
    const t = { kind: "transfer" as const, date: "2026-12-05", amount: 100, currency: "PHP" };
    await expect(addEntry(store, { ...t, accountId: "B" })).rejects.toThrow(/from and a to/);
    await expect(addEntry(store, { ...t, accountId: "B", toAccountId: "B" })).rejects.toThrow(/two different/);
    await expect(addEntry(store, { ...t, accountId: "B", toAccountId: "C", split: { paidBy: "me", mode: "half", shares: [] } })).rejects.toThrow(/cannot be split/);
    await expect(addEntry(store, { ...t, kind: "expense", toAccountId: "C" })).rejects.toThrow(/Only a transfer/);
    expect(await loadAllEntries(store)).toEqual([]);
  });
});

describe("refunds", () => {
  const jacket = e("j", "2026-11-03", 5000, { accountId: "C", category: "Shopping" });
  const back = e("r", "2026-11-20", 500, { kind: "income", refund: true, refundOf: "j", accountId: "C", category: "Shopping" });

  it("lower spending in their category and what the card owes", () => {
    const s = summarize(items([jacket, back]), "PHP", "2026-11-01", "2026-11-30");
    expect(s.total).toBe(4500 * P);
    expect(s.byCategory).toEqual([{ category: "Shopping", amount: 4500 * P }]);
    expect(s.byDay[19]).toBe(-500 * P);
    expect(accountBalances([bank, card], items([jacket, back]), "PHP").cards[0]!.balance).toBe(-4500 * P);
  });

  it("on a split expense lower spending by my share of the refund", () => {
    const split = { ...jacket, split: { paidBy: "me", mode: "half" as const, shares: [{ personId: "m", amount: 2500 * P }] } };
    const s = summarize(items([back]), "PHP", "2026-11-20", "2026-11-20", [split]);
    expect(s.total).toBe(-250 * P);
  });

  it("are recorded against an expense and cannot add up to more than it", async () => {
    const x = await addEntry(store, { kind: "expense", date: "2026-11-03", amount: 1000 * P, currency: "PHP", category: "Shopping", note: "Jacket", accountId: "C" });
    const r = await addRefund(store, x, 500 * P, "2026-11-20");
    expect(r).toMatchObject({ kind: "income", refund: true, refundOf: x.id, accountId: "C", category: "Shopping", note: "Refund: Jacket" });
    expect(refundable(x, await loadAllEntries(store))).toBe(500 * P);
    await expect(addRefund(store, x, 501 * P, "2026-11-21")).rejects.toThrow(/more than is left/);
    await addRefund(store, x, 500 * P, "2026-11-21");
    await expect(addRefund(store, x, 1, "2026-11-22")).rejects.toThrow(/fully refunded/);
    await expect(addRefund(store, r, 1, "2026-11-22")).rejects.toThrow(/Only an expense/);
  });

  it("stay refunds when edited", async () => {
    const x = await addEntry(store, { kind: "expense", date: "2026-11-03", amount: 1000 * P, currency: "PHP", accountId: "C" });
    const r = await addRefund(store, x, 500 * P, "2026-11-20");
    expect(await updateEntry(store, "2026-11", r.id, { amount: 400 * P, kind: "income", note: "x" })).toMatchObject({ refund: true, refundOf: x.id, amount: 400 * P });
  });

  it("can only be income and cannot be split", async () => {
    const r = { date: "2026-11-20", amount: 100, currency: "PHP", refund: true as const };
    await expect(addEntry(store, { ...r, kind: "expense" })).rejects.toThrow(/Only income/);
    await expect(addEntry(store, { ...r, kind: "income", split: { paidBy: "me", mode: "half", shares: [] } })).rejects.toThrow(/cannot be split/);
    await expect(addEntry(store, { ...r, kind: "income" })).resolves.toMatchObject({ refund: true });
  });
});

describe("compatibility", () => {
  // The shape a V1.0.3 export has: accounts with no type or card fields, the three old kinds only.
  const old = () => makeBundle({
    "settings.json": { schemaVersion: 1, baseCurrency: "PHP", defaultCurrency: "PHP", categories: ["Food"] },
    "accounts.json": { accounts: [{ id: "B", name: "BDO", currency: "PHP", openingBalance: 5000000, updatedAt: "2026-10-01T00:00:00.000Z" }] },
    "people.json": { people: [{ id: "m", name: "Maya", updatedAt: "2026-10-01T00:00:00.000Z" }] },
    "rules.json": { rules: [] },
    "months/2026-10.json": { month: "2026-10", entries: [
      { id: "1", kind: "expense", date: "2026-10-02", amount: 120000, currency: "PHP", category: "Food", accountId: "B", createdAt: "a", updatedAt: "a" },
      { id: "2", kind: "income", date: "2026-10-05", amount: 3000000, currency: "PHP", category: "Salary", accountId: "B", createdAt: "a", updatedAt: "a" },
      { id: "3", kind: "settlement", date: "2026-10-06", amount: 10000, currency: "PHP", category: "Settlement", personId: "m", direction: "in", accountId: "B", createdAt: "a", updatedAt: "a" },
    ] },
  });

  it("imports an old backup with no card fields, and its accounts are bank accounts", async () => {
    expect(validateBundle(old())).toEqual([]);
    await importBundle(store, old());
    const accounts = await list(store, "accounts");
    const b = accountBalances(accounts, items(await loadAllEntries(store)), "PHP");
    expect(b.cards).toEqual([]);
    expect(b.totalBase).toBe(5000000 - 120000 + 3000000 + 10000);
  });

  it("checks the new fields when they are there", () => {
    const withBad = (entry: object, account: object = {}) => {
      const b = old();
      (b.files["months/2026-10.json"]!.entries as object[]).push({ id: "9", date: "2026-10-09", amount: 1, currency: "PHP", createdAt: "a", updatedAt: "a", ...entry });
      Object.assign((b.files["accounts.json"]!.accounts as object[])[0]!, account);
      return validateBundle(b);
    };
    expect(withBad({ kind: "transfer", accountId: "B", toAccountId: "C" })).toEqual([]);
    expect(withBad({ kind: "transfer", accountId: "B" })[0]).toMatch(/to account/);
    expect(withBad({ kind: "expense", refund: true })[0]).toMatch(/only income/);
    expect(withBad({ kind: "loan" })[0]).toMatch(/bad kind/);
    expect(withBad({ kind: "expense" }, { type: "card", statementDay: 31, dueDays: 25, limit: 1, dueOverrides: { "2026-11-15": "2026-12-07" } })).toEqual([]);
    expect(withBad({ kind: "expense" }, { type: "loan" })[0]).toMatch(/bad type/);
    expect(withBad({ kind: "expense" }, { statementDay: 32 })[0]).toMatch(/statement day/);
    expect(withBad({ kind: "expense" }, { dueOverrides: { x: "2026-12-07" } })[0]).toMatch(/due dates/);
  });

  it("merges transfers and card accounts by newest edit like everything else", () => {
    const t = (u: string, amount: number) => ({ ...e("t", "2026-12-05", amount, { kind: "transfer", accountId: "B", toAccountId: "C" }), updatedAt: u });
    const m = mergeDocs("months/2026-12.json", { entries: [t("2026-12-06", 7000)] }, { entries: [t("2026-12-05", 6000)] });
    expect((m.entries as Entry[])[0]!.amount).toBe(7000 * P);
    const a = mergeDocs("accounts.json", { accounts: [{ ...card, updatedAt: "1" }] }, { accounts: [{ ...card, limit: 5, updatedAt: "2" }] });
    expect((a.accounts as Account[])[0]!.limit).toBe(5);
  });

  it("writes transfers and refunds to the spreadsheet with both accounts", () => {
    const csv = entriesCsv([
      e("t", "2026-12-05", 7000, { kind: "transfer", accountId: "B", toAccountId: "C" }),
      e("r", "2026-12-06", 500, { kind: "income", refund: true, accountId: "C" }),
    ], [], [bank, card]).split("\r\n");
    expect(csv[0]).toMatch(/,to_account$/);
    expect(csv[1]).toBe("2026-12-05,transfer,Food,,7000.00,PHP,,BDO,,,,Visa");
    expect(csv[2]).toBe("2026-12-06,refund,Food,,500.00,PHP,,Visa,,,,");
  });
});
