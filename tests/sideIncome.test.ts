import { beforeEach, describe, expect, it } from "vitest";
import { accountBalances } from "../src/data/accounts";
import { makeBundle } from "../src/data/bundle";
import { upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { exportBundle, importBundle, validateBundle } from "../src/data/exportImport";
import { salaryFor, setRepeat } from "../src/data/income";
import { addEntry, loadAllEntries, updateEntry } from "../src/data/months";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry, Rule } from "../src/data/schema";
import { incomeAccounts, incomeEditor, newIncome, SIDE_INCOME } from "../src/data/sideIncome";
import { summarize } from "../src/data/summary";
import { mergeDocs } from "../src/sync/merge";

const bankA: Account = { id: "A1", name: "Bank A", currency: "PHP", openingBalance: 1000000, updatedAt: "x" };
const bankUsd: Account = { id: "A3", name: "Bank C", currency: "USD", openingBalance: 0, rate: "56", updatedAt: "x" };
const cardA: Account = { id: "C1", name: "Card A", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, updatedAt: "x" };
const gift = (extra: Partial<Entry> = {}): Entry => ({ id: "g1", kind: "income", date: "2026-10-10", amount: 500000, currency: "PHP", category: "Gift", accountId: "A1", createdAt: "x", updatedAt: "x", ...extra });

let store: LedgerStore;
let n = 0;
beforeEach(async () => { store = await LedgerStore.open(`side-${n++}`); });

describe("one-off income", () => {
  it("raises the bank account it was paid into", () => {
    const b = accountBalances([bankA], ledgerItems([gift()], [], "0000-01-01", "2026-10-31"), "PHP");
    expect(b.accounts[0]!.balance).toBe(1000000 + 500000);
    expect(b.totalBase).toBe(1500000);
  });

  it("goes into bank accounts only, in the account's currency", () => {
    expect(incomeAccounts([bankA, cardA, bankUsd, { ...bankA, id: "old", deleted: true as const }]).map((a) => a.id)).toEqual(["A1", "A3"]);
    expect(() => newIncome({ amount: 100, category: "Gift", date: "2026-10-10", account: cardA, base: "PHP" })).toThrow("bank account");
    expect(newIncome({ amount: 100, category: "Interest", date: "2026-10-10", account: bankUsd, base: "PHP" })).toMatchObject({ kind: "income", currency: "USD", rate: "56", accountId: "A3" });
    expect(newIncome({ amount: 100, category: "Sale", note: "  ", date: "2026-10-10", account: bankA, base: "PHP" })).toMatchObject({ currency: "PHP", rate: undefined, note: undefined });
    expect(newIncome({ amount: 100, category: "Gift", date: "2026-10-10", base: "PHP" })).toMatchObject({ currency: "PHP", accountId: undefined });
  });

  it("never offers Salary", () => {
    expect(SIDE_INCOME).not.toContain("Salary");
    expect(() => newIncome({ amount: 100, category: "Salary", date: "2026-10-10", account: bankA, base: "PHP" })).toThrow();
  });

  it("is not spending and not in the category chart", () => {
    const lunch: Entry = { id: "l", kind: "expense", date: "2026-10-03", amount: 50000, currency: "PHP", category: "Food", accountId: "A1", createdAt: "x", updatedAt: "x" };
    const s = summarize(ledgerItems([lunch, gift()], [], "2026-10-01", "2026-10-31"), "PHP", "2026-10-01", "2026-10-31");
    expect(s.total).toBe(50000);
    expect(s.byCategory.map((c) => c.category)).toEqual(["Food"]);
  });

  it("leaves salary alone: salaryFor ignores it and setRepeat neither folds nor removes it", async () => {
    await addEntry(store, { kind: "income", date: "2026-10-01", amount: 5000000, currency: "PHP", category: "Salary", accountId: "A1" });
    const g = await addEntry(store, newIncome({ amount: 500000, category: "Gift", date: "2026-10-12", account: bankA, base: "PHP" }));
    await addEntry(store, newIncome({ amount: 300000, category: "Side Job", date: "2026-11-05", account: bankA, base: "PHP" }));
    let entries = await loadAllEntries(store);
    expect(salaryFor("2026-10-01", entries, [])).toMatchObject({ amount: 5000000, source: "entry" });
    expect(salaryFor("2026-11-01", entries, [])).toBeUndefined(); // a month with only side income has no salary
    await setRepeat(store, true, { today: "2026-10-19", base: "PHP" });
    entries = await loadAllEntries(store);
    const live = entries.filter((e) => !e.deleted);
    expect(live.map((e) => e.category).sort()).toEqual(["Gift", "Side Job"]); // the salary entry folded into the plan
    expect(live.find((e) => e.id === g.id)).toMatchObject({ amount: 500000, category: "Gift" });
    const rules = ((await store.get<{ rules: Rule[] }>("rules.json"))?.rules ?? []);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ type: "income", amount: 5000000, overrides: {} });
  });
});

describe("which form edits an income entry", () => {
  it("side income opens the income form; salary, refunds, other income and expenses keep the expense form", () => {
    expect(incomeEditor(gift())).toBe("income");
    for (const c of SIDE_INCOME) expect(incomeEditor(gift({ category: c }))).toBe("income");
    expect(incomeEditor(gift({ category: "Salary" }))).toBe("add");
    expect(incomeEditor(gift({ refund: true, refundOf: "x", category: "Other" }))).toBe("add");
    expect(incomeEditor(gift({ category: "Bonus" }))).toBe("add");
    expect(incomeEditor(gift({ category: undefined }))).toBe("add");
    expect(incomeEditor(gift({ kind: "expense" }))).toBe("add");
  });

  it("editing keeps a salary entry and a refund as they were (the data the expense form writes)", async () => {
    const sal = await addEntry(store, { kind: "income", date: "2026-10-01", amount: 5000000, currency: "PHP", category: "Salary", accountId: "A1" });
    const edited = await updateEntry(store, "2026-10", sal.id, { kind: "income", amount: 5100000, category: "Salary" });
    expect(edited).toMatchObject({ kind: "income", category: "Salary", amount: 5100000 });
    expect(incomeEditor(edited)).toBe("add");
  });
});

describe("backups and sync", () => {
  it("export, import and merge carry a side income entry unchanged", async () => {
    await upsert(store, "accounts", bankA);
    const saved = await addEntry(store, newIncome({ amount: 250000, category: "Spare Change", note: "Coins", date: "2026-10-12", account: bankA, base: "PHP" }));
    const b = await exportBundle(store);
    expect(validateBundle(b)).toEqual([]);
    const other = await LedgerStore.open(`side-other-${n++}`);
    await importBundle(other, makeBundle(b.files));
    const back = (await loadAllEntries(other)).find((e) => e.id === saved.id);
    expect(back).toEqual(saved);
    const newer = { ...saved, amount: 300000, updatedAt: "9999" };
    const m = mergeDocs("months/2026-10.json", { month: "2026-10", entries: [saved] }, { month: "2026-10", entries: [newer] });
    expect(m.entries).toEqual([newer]);
  });
});
