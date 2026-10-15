import { beforeEach, describe, expect, it } from "vitest";
import { accountBalances } from "../src/data/accounts";
import { moveAndRemove, reassignAccounts } from "../src/data/accountMove";
import { orphans } from "../src/data/usage";
import { salaryFor, setSalary, setSalaryAccount } from "../src/data/income";
import { occurrences } from "../src/data/rules";
import { getSettings, listAll, remove, restore, saveSettings, upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { addEntry, loadAllEntries, deleteEntry, updateEntry } from "../src/data/months";
import type { Account, Rule } from "../src/data/schema";
import { itemsToDate, loadWorld } from "../src/data/world";

let store: LedgerStore;
let n = 0;
beforeEach(async () => {
  store = await LedgerStore.open(`safeguards-${n++}`);
});

const day = "2026-09-10"; // in the past, so everything counts toward today's balances
const bank = (name: string, openingBalance: number, currency = "PHP") => upsert(store, "accounts", { name, currency, openingBalance });
const card = (name: string, owedAtStart = 0) => upsert(store, "accounts", { name, currency: "PHP", openingBalance: -owedAtStart, type: "card", statementDay: 15, dueDays: 25 });
const spend = (accountId: string, amount: number, date = day) => addEntry(store, { kind: "expense", date, amount, currency: "PHP", category: "Food", accountId });
const pay = (accountId: string, toAccountId: string, amount: number) => addEntry(store, { kind: "transfer", date: day, amount, currency: "PHP", category: "Card payment", accountId, toAccountId });
const plan = (r: Partial<Rule>) => upsert(store, "rules", { type: "recurring", kind: "expense", amount: 50000, currency: "PHP", frequency: "monthly", start: "2026-08-01", ...r } as Rule);

async function money() {
  const w = await loadWorld(store);
  const b = accountBalances(w.accounts, itemsToDate(w, "2026-10-15"), w.base);
  const of = (id: string) => [...b.accounts, ...b.cards].find((x) => x.account.id === id)?.balance;
  return { other: b.unassigned, total: b.totalBase, of };
}

describe("move before remove", () => {
  it("moves a bank's entries, transfers, plans and defaults, so Other stays 0 and only its opening balance leaves the total", async () => {
    const a = await bank("Bank A", 10000000);
    const b = await bank("Bank B", 5000000);
    const c = await card("Card A");
    await spend(a.id, 100000);
    await pay(a.id, c.id, 200000);
    await addEntry(store, { kind: "income", date: day, amount: 3000000, currency: "PHP", category: "Salary", accountId: a.id });
    const gone = await spend(a.id, 70000);
    await deleteEntry(store, "2026-09", gone.id);
    await plan({ accountId: a.id });
    await plan({ accountId: b.id, revisions: [{ from: "2026-09-01", accountId: a.id }] });
    await saveSettings(store, { defaults: { expense: a.id, income: a.id, cardPayment: a.id, category: "Food" } });
    const before = await money();
    const aBefore = before.of(a.id)!;

    const r = await moveAndRemove(store, a.id, b.id);
    expect(r).toEqual({ entries: 3, plans: 2, kept: 0 });

    const after = await money();
    expect(after.other).toBe(0);
    expect(after.total).toBe(before.total - 10000000);
    expect(after.of(b.id)).toBe(before.of(b.id)! + aBefore - 10000000);
    expect(after.of(c.id)).toBe(before.of(c.id));
    expect((await listAll(store, "accounts")).find((x) => x.id === a.id)?.deleted).toBe(true);
    expect((await getSettings(store)).defaults).toEqual({ expense: b.id, income: b.id, cardPayment: b.id, category: "Food" });
    // A deleted entry is history and is left alone; changed ones get a new updatedAt.
    const all = await loadAllEntries(store);
    expect(all.find((e) => e.id === gone.id)?.accountId).toBe(a.id);
    expect(all.filter((e) => !e.deleted).every((e) => e.accountId !== a.id && e.toAccountId !== a.id)).toBe(true);
    const rules = await listAll(store, "rules");
    expect(rules.map((x) => x.accountId)).toEqual([b.id, b.id]);
    expect(rules[1]!.revisions![0]!.accountId).toBe(b.id);
  });

  it("moves a card's charges and payments, so bank total is unchanged and the other card owes them", async () => {
    const a = await bank("Bank A", 10000000);
    const c1 = await card("Card A", 30000);
    const c2 = await card("Card B");
    await spend(c1.id, 100000);
    await spend(c1.id, 40000);
    await pay(a.id, c1.id, 50000);
    await saveSettings(store, { defaults: { expense: c1.id, cardPayment: a.id } });
    const before = await money();

    expect(await moveAndRemove(store, c1.id, c2.id)).toEqual({ entries: 3, plans: 0, kept: 0 });

    const after = await money();
    expect(after.other).toBe(0);
    expect(after.total).toBe(before.total);
    // Card A's owed at start goes with Card A; its charges and payments now sit on Card B.
    expect(after.of(c2.id)).toBe(-(100000 + 40000 - 50000));
    expect((await getSettings(store)).defaults).toEqual({ expense: c2.id, cardPayment: a.id });
  });

  it("never makes a transfer go from an account to itself, and counts the ones it kept", async () => {
    const a = await bank("Bank A", 1000000);
    const b = await bank("Bank B", 1000000);
    const t = await pay(a.id, b.id, 10000);
    expect(await moveAndRemove(store, a.id, b.id)).toEqual({ entries: 0, plans: 0, kept: 1 });
    expect((await loadAllEntries(store)).find((e) => e.id === t.id)?.accountId).toBe(a.id);
  });

  it("refuses a target that is removed or the same account, and changes nothing", async () => {
    const a = await bank("Bank A", 1000000);
    const b = await bank("Bank B", 1000000);
    await spend(a.id, 10000);
    await remove(store, "accounts", b.id);
    await expect(moveAndRemove(store, a.id, b.id)).rejects.toThrow();
    await expect(moveAndRemove(store, a.id, a.id)).rejects.toThrow();
    const accts = (await listAll(store, "accounts")) as Account[];
    expect(accts.find((x) => x.id === a.id)?.deleted).toBeUndefined();
    expect((await loadAllEntries(store))[0]!.accountId).toBe(a.id);
  });
});

describe("restore", () => {
  it("brings back a removed bank and card with the same id, so balances and the total are as before", async () => {
    const a = await bank("Bank A", 10000000);
    const c = await card("Card A", 30000);
    await spend(a.id, 100000);
    await spend(c.id, 250000);
    await pay(a.id, c.id, 200000);
    const before = await money();
    await remove(store, "accounts", a.id);
    await remove(store, "accounts", c.id);
    const removed = await money();
    expect(removed.total).not.toBe(before.total);
    expect(removed.other).not.toBe(0);

    await restore(store, "accounts", a.id);
    await restore(store, "accounts", c.id);
    const after = await money();
    expect(after).toEqual({ ...before, of: after.of });
    expect(after.of(a.id)).toBe(before.of(a.id));
    expect(after.of(c.id)).toBe(before.of(c.id));
    const all = await listAll(store, "accounts");
    expect(all.map((x) => x.id)).toEqual([a.id, c.id]);
    expect(all.every((x) => !("deleted" in x))).toBe(true);
  });
});

describe("fix leftovers", () => {
  it("moves every entry and plan on removed accounts to one account, so Other goes back to 0", async () => {
    const a = await bank("Bank A", 10000000);
    const b = await bank("Bank B", 5000000);
    const c = await card("Card A");
    const d = await card("Card B");
    await spend(c.id, 100000);
    await pay(a.id, c.id, 60000);
    await spend(b.id, 20000);
    await plan({ accountId: d.id });
    await plan({ accountId: a.id, revisions: [{ from: "2026-09-01", accountId: d.id }] });
    await remove(store, "accounts", c.id);
    await remove(store, "accounts", d.id);
    const w = await loadWorld(store);
    const o = orphans(w.entries, w.rules, await listAll(store, "accounts"));
    expect(o.entries).toHaveLength(2);
    expect(o.rules).toHaveLength(2);
    expect(o.ids.sort()).toEqual([c.id, d.id].sort());
    expect((await money()).other).not.toBe(0);

    const e = await card("Card E");
    expect(await reassignAccounts(store, o.ids, e.id)).toEqual({ entries: 2, plans: 2, kept: 0 });
    const w2 = await loadWorld(store);
    expect(orphans(w2.entries, w2.rules, await listAll(store, "accounts"))).toEqual({ entries: [], rules: [], ids: [] });
    expect((await money()).other).toBe(0);
    // Removed accounts stay removed; only what pointed at them moved.
    expect((await listAll(store, "accounts")).filter((x) => x.deleted).map((x) => x.id).sort()).toEqual([c.id, d.id].sort());
  });
});

describe("edit a card payment", () => {
  it("changes from, to, amount and date (moving months), and refuses the same account at both ends", async () => {
    const a = await bank("Bank A", 10000000);
    const b = await bank("Bank B", 5000000);
    const c1 = await card("Card A");
    const c2 = await card("Card B");
    await spend(c1.id, 100000);
    await spend(c2.id, 100000);
    const t = await pay(a.id, c1.id, 50000);
    const before = await money();
    const moved = await updateEntry(store, "2026-09", t.id, { accountId: b.id, toAccountId: c2.id, amount: 80000, date: "2026-08-20" });
    expect(moved).toMatchObject({ accountId: b.id, toAccountId: c2.id, amount: 80000, date: "2026-08-20", kind: "transfer" });
    const after = await money();
    expect(after.of(a.id)).toBe(before.of(a.id)! + 50000);
    expect(after.of(b.id)).toBe(before.of(b.id)! - 80000);
    expect(after.of(c1.id)).toBe(-100000);
    expect(after.of(c2.id)).toBe(-100000 + 80000);
    expect(after.other).toBe(0);
    const all = await loadAllEntries(store);
    expect(all.filter((e) => e.id === t.id).map((e) => [e.date, !!e.deleted]).sort()).toEqual([["2026-08-20", false], ["2026-09-10", true]]);
    await expect(updateEntry(store, "2026-08", t.id, { toAccountId: b.id })).rejects.toThrow("two different accounts");
  });
});

describe("salary paid into", () => {
  const today = "2026-10-15";
  const salaryRule = (r: Partial<Rule>) => upsert(store, "rules", { type: "income", kind: "income", amount: 3000000, currency: "PHP", category: "Salary", frequency: "monthly", start: "2026-07-01", ...r } as Rule);
  const salary = (accountId: string, date: string, amount = 3000000) => addEntry(store, { kind: "income", date, amount, currency: "PHP", category: "Salary", accountId });

  it("moves a running salary plan from this month on; earlier months and per-month amounts stay", async () => {
    const a = await bank("Bank A", 0);
    const b = await bank("Bank B", 0);
    const r = await salaryRule({ accountId: a.id, overrides: { "2026-11-01": { amount: 3500000 } } });
    await setSalaryAccount(store, b.id, { today });
    const next = (await listAll(store, "rules"))[0]!;
    expect(next.accountId).toBe(a.id);
    expect(next.revisions).toEqual([{ from: "2026-10-01", accountId: b.id }]);
    expect(next.overrides).toEqual(r.overrides);
    const occ = occurrences(next, "2026-07-01", "2026-12-31");
    expect(occ.map((o) => o.accountId)).toEqual([a.id, a.id, a.id, b.id, b.id, b.id]);
    expect(occ[4]!.amount).toBe(3500000);
    // Choosing the same account again changes nothing.
    await setSalaryAccount(store, b.id, { today });
    expect((await listAll(store, "rules"))[0]!.updatedAt).toBe(next.updatedAt);
    // Back to Bank A: the same revision is replaced, not stacked.
    await setSalaryAccount(store, a.id, { today });
    expect((await listAll(store, "rules"))[0]!.revisions).toEqual([{ from: "2026-10-01", accountId: a.id }]);
  });

  it("sets the account of a plan that starts this month or later", async () => {
    const a = await bank("Bank A", 0);
    const b = await bank("Bank B", 0);
    await salaryRule({ start: "2026-11-01", accountId: a.id });
    await setSalaryAccount(store, b.id, { today });
    const next = (await listAll(store, "rules"))[0]!;
    expect(next.accountId).toBe(b.id);
    expect(next.revisions).toEqual([]);
  });

  it("moves manual salary entries from this month on, not earlier ones, and Forecast reads the new account", async () => {
    const a = await bank("Bank A", 0);
    const b = await bank("Bank B", 0);
    const sep = await salary(a.id, "2026-09-01");
    const oct = await salary(a.id, "2026-10-01");
    const nov = await salary(a.id, "2026-11-01");
    await setSalaryAccount(store, b.id, { today });
    const all = await loadAllEntries(store);
    const acct = (id: string) => all.find((e) => e.id === id)?.accountId;
    expect([acct(sep.id), acct(oct.id), acct(nov.id)]).toEqual([a.id, b.id, b.id]);
    expect(salaryFor("2026-10-01", all, [])?.accountId).toBe(b.id);
    expect(salaryFor("2026-09-01", all, [])?.accountId).toBe(a.id);
  });

  it("puts a changed month's salary entry into the chosen account", async () => {
    const a = await bank("Bank A", 0);
    const b = await bank("Bank B", 0);
    const e = await salary(a.id, "2026-12-01");
    await setSalary(store, "2026-12-01", 3200000, { base: "PHP", accountId: b.id });
    expect((await loadAllEntries(store)).find((x) => x.id === e.id)).toMatchObject({ amount: 3200000, accountId: b.id });
  });
});
