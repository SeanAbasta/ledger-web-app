import { beforeEach, describe, expect, it } from "vitest";
import { accountBalances } from "../src/data/accounts";
import { list } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { forecast } from "../src/data/forecast";
import { activeSalaryRule, salaryFor, setRepeat, setSalary } from "../src/data/income";
import { addEntry, loadAllEntries } from "../src/data/months";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry, Rule } from "../src/data/schema";

const e = (date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: date + amount + (extra.category ?? ""), kind: "expense", date, amount, currency: "PHP", category: "Food", createdAt: "x", updatedAt: "x", ...extra,
});
const rule = (r: Partial<Rule>): Rule => ({ id: "R", type: "recurring", kind: "expense", amount: 1000, currency: "PHP", frequency: "monthly", start: "2026-01-05", updatedAt: "x", ...r });
const acct = (a: Partial<Account>): Account => ({ id: "A", name: "BDO", currency: "PHP", openingBalance: 100000, updatedAt: "x", ...a });
const items = (entries: Entry[], rules: Rule[] = [], to = "2026-10-31") => ledgerItems(entries, rules, "0000-01-01", to);

describe("accountBalances", () => {
  it("opening + income - expenses +/- settlements, per account", () => {
    const b = accountBalances([acct({})], items([
      e("2026-10-01", 20000, { accountId: "A" }),
      e("2026-10-02", 500000, { kind: "income", category: "Salary", accountId: "A" }),
      e("2026-10-03", 30000, { kind: "settlement", direction: "in", accountId: "A" }),
      e("2026-10-04", 10000, { kind: "settlement", direction: "out", accountId: "A" }),
    ]), "PHP");
    expect(b.accounts[0]!.balance).toBe(100000 - 20000 + 500000 + 30000 - 10000);
    expect(b.totalBase).toBe(b.accounts[0]!.balance);
  });
  it("only counts what I paid out of pocket on splits", () => {
    const paidByMe = e("2026-10-01", 1000, { accountId: "A", split: { paidBy: "me", mode: "half", shares: [{ personId: "m", amount: 500 }] } });
    const paidByThem = e("2026-10-02", 1000, { accountId: "A", split: { paidBy: "m", mode: "i-owe", shares: [{ personId: "me", amount: 1000 }] } });
    expect(accountBalances([acct({ openingBalance: 0 })], items([paidByMe, paidByThem]), "PHP").accounts[0]!.balance).toBe(-1000);
  });
  it("puts account-less flows in unassigned and converts foreign accounts with their rate", () => {
    const usd = acct({ id: "U", currency: "USD", openingBalance: 10000, rate: "56" });
    const b = accountBalances([usd], items([e("2026-10-01", 500)]), "PHP");
    expect(b.unassigned).toBe(-500);
    expect(b.totalBase).toBe(10000 * 56 - 500);
  });
  it("skips what it cannot convert", () => {
    const b = accountBalances([acct({ id: "U", currency: "USD", openingBalance: 100 })], items([e("2026-10-01", 10, { currency: "EUR" })]), "PHP");
    expect(b.skipped).toBe(2);
  });
  it("includes generated rule payments to date", () => {
    const b = accountBalances([acct({ openingBalance: 0 })], items([], [rule({ accountId: "A", start: "2026-09-05" })]), "PHP");
    expect(b.accounts[0]!.balance).toBe(-2000);
  });
});

describe("forecast", () => {
  const today = "2026-10-10";
  const history = [e("2026-07-03", 30000), e("2026-08-03", 60000), e("2026-09-03", 90000)]; // avg 60000
  const base = { today, base: "PHP", entries: history, rules: [] as Rule[], start: 1000000 };

  it("averages the last 3 full months and prorates the current one", () => {
    const f = forecast(base);
    expect(f.avgVariable).toBe(60000);
    expect(f.basis).toBe(3);
    expect(f.months[0]!.variable).toBe(Math.round((60000 * 21) / 31));
    expect(f.months[1]!.variable).toBe(60000);
    expect(f.months).toHaveLength(12);
  });
  it("adds known income and subtracts obligations", () => {
    const f = forecast({
      ...base,
      rules: [rule({ amount: 18000, start: "2026-11-01" }), rule({ id: "S", type: "income", kind: "income", amount: 100000, start: "2026-11-01" })],
    });
    expect(f.months[1]!.income).toBe(100000);
    expect(f.months[1]!.obligations).toBe(18000);
    expect(f.months[1]!.end).toBe(f.months[0]!.end + 100000 - 18000 - 60000);
    expect(f.months[1]!.noIncome).toBe(false);
    expect(f.months[0]!.noIncome).toBe(true);
  });
  it("counts income already received this month as known, but not in the balance twice", () => {
    const f = forecast({ ...base, entries: [...history, e("2026-10-01", 500000, { kind: "income", category: "Salary" })] });
    expect(f.months[0]!.noIncome).toBe(false);
    expect(f.months[0]!.income).toBe(0);
  });
  it("uses only months since the first entry and handles no history", () => {
    expect(forecast({ ...base, entries: [e("2026-09-03", 90000)] }).avgVariable).toBe(90000);
    const none = forecast({ ...base, entries: [] });
    expect(none.avgVariable).toBe(0);
    expect(none.basis).toBe(0);
    expect(none.months[11]!.end).toBe(1000000);
  });
  it("counts future-dated entries as obligations and my share of splits only", () => {
    const f = forecast({ ...base, entries: [...history, e("2026-11-15", 10000, { split: { paidBy: "me", mode: "half", shares: [{ personId: "m", amount: 5000 }] } })] });
    expect(f.months[1]!.obligations).toBe(5000);
  });
});

describe("salary", () => {
  let store: LedgerStore;
  let n = 0;
  beforeEach(async () => { store = await LedgerStore.open(`inc-${n++}`); });
  const o = { base: "PHP" };
  const get = async () => ({ entries: await loadAllEntries(store), rules: await list(store, "rules") });

  it("sets, updates and clears a manual month", async () => {
    await setSalary(store, "2026-11-01", 6000000, o);
    await setSalary(store, "2026-11-01", 6500000, o);
    let w = await get();
    expect(salaryFor("2026-11-15", w.entries, w.rules)).toMatchObject({ amount: 6500000, source: "entry" });
    await setSalary(store, "2026-11-01", null, o);
    w = await get();
    expect(salaryFor("2026-11-01", w.entries, w.rules)).toBeUndefined();
  });
  it("repeat folds later manual months into one rule with overrides, then edits and skips per month", async () => {
    await setSalary(store, "2026-10-01", 6000000, o);
    await setSalary(store, "2026-11-01", 5800000, o);
    await setRepeat(store, true, { today: "2026-10-10", ...o });
    let w = await get();
    const r = activeSalaryRule(w.rules, "2026-10-10")!;
    expect(r.amount).toBe(6000000);
    expect(w.entries.filter((x) => !x.deleted)).toEqual([]);
    expect(salaryFor("2026-10-01", w.entries, w.rules)?.amount).toBe(6000000);
    expect(salaryFor("2026-11-01", w.entries, w.rules)?.amount).toBe(5800000);
    expect(salaryFor("2027-03-01", w.entries, w.rules)?.amount).toBe(6000000);

    await setSalary(store, "2026-12-01", 7000000, o); // override one month
    await setSalary(store, "2027-01-01", null, o); // none that month
    await setSalary(store, "2026-11-01", 6000000, o); // back to the usual amount
    w = await get();
    expect(salaryFor("2026-12-01", w.entries, w.rules)?.amount).toBe(7000000);
    expect(salaryFor("2027-01-01", w.entries, w.rules)).toBeUndefined();
    expect(salaryFor("2026-11-01", w.entries, w.rules)?.amount).toBe(6000000);
  });
  it("repeat needs a salary, and turning it off ends the series this month", async () => {
    await expect(setRepeat(store, true, { today: "2026-10-10", ...o })).rejects.toThrow();
    await setSalary(store, "2026-10-01", 6000000, o);
    await setRepeat(store, true, { today: "2026-10-10", ...o });
    await setRepeat(store, false, { today: "2026-10-10", ...o });
    const w = await get();
    expect(salaryFor("2026-10-01", w.entries, w.rules)?.amount).toBe(6000000);
    expect(salaryFor("2026-11-01", w.entries, w.rules)).toBeUndefined();
    expect(activeSalaryRule(w.rules, "2026-11-01")).toBeUndefined();
  });
  it("addEntry still validates", async () => {
    await expect(addEntry(store, { kind: "income", date: "2026-10-01", amount: 0, currency: "PHP" })).rejects.toThrow();
  });
});

describe("a revised price flows into the forecast and balances", () => {
  it("uses the new amount from its date", async () => {
    const { applyRevision } = await import("../src/data/rules");
    const r = applyRevision(rule({ amount: 50000, start: "2026-11-05", accountId: "A" }), "2026-12-05", { amount: 65000 });
    const f = forecast({ today: "2026-10-10", base: "PHP", entries: [], rules: [r], start: 1000000 });
    expect(f.months[1]!.obligations).toBe(50000); // Nov
    expect(f.months[2]!.obligations).toBe(65000); // Dec
    const b = accountBalances([acct({ openingBalance: 0 })], items([], [r], "2027-01-31"), "PHP");
    expect(b.accounts[0]!.balance).toBe(-(50000 + 65000 + 65000)); // Nov, Dec, Jan
  });
});
