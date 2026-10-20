import { describe, expect, it } from "vitest";
import { addDays, periodOf } from "../src/data/dates";
import { ledgerItems, occurrences, type LedgerItem } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { cardVisible, nextCardKeys, withoutCardRows } from "../src/features/ledger/nextCard";

const T = "2026-10-20";
const U = "2026-10-01T00:00:00Z";
const plan = (id: string, start: string, extra: Partial<Rule> = {}): Rule => ({ id, type: "recurring", kind: "expense", amount: 100000, currency: "PHP", category: "Bills", note: id, frequency: "monthly", start, updatedAt: U, ...extra });
const entry = (id: string, date: string): Entry => ({ id, kind: "expense", date, amount: 25000, currency: "PHP", category: "Food", note: id, createdAt: U, updatedAt: U });

// The same "due" list the Ledger builds: expense payments from tomorrow to 30 days out, soonest first.
const dueOf = (rules: Rule[]) => rules.flatMap((r) => occurrences(r, addDays(T, 1), addDays(T, 30))).sort((a, b) => (a.date < b.date ? -1 : 1)).filter((o) => o.kind === "expense");
const names = (items: LedgerItem[]): string[] => items.map((it) => (it.type === "entry" ? it.entry.note ?? "" : `${it.occ.note}@${it.date}`));

const rules = [
  plan("Phone", "2026-08-25"),
  plan("Salary", "2026-07-30", { type: "income", kind: "income", category: "Salary", amount: 5000000 }),
  plan("Rent", "2026-09-20"), // today's payment
  plan("Laptop", "2026-11-05", { type: "installment", count: 6, total: 600000, amount: 100000 }),
];
const entries = [entry("Coffee", T), entry("Concert", "2026-10-28")]; // a future-dated one-off

describe("Next 30 days card rows leave the day list", () => {
  it("lists the first five keys only while the card is visible", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => plan(id, addDays(T, i + 1)));
    const due = dueOf(seven);
    expect(due).toHaveLength(7);
    expect([...nextCardKeys(due, true)]).toEqual(due.slice(0, 5).map((o) => `${o.ruleId}@${o.date}`));
    expect(nextCardKeys(due, false).size).toBe(0);
  });

  it("Month view of this month: the card's payment goes, income, entries and today's payment stay", () => {
    const [from, to] = periodOf("Month", T);
    const items = ledgerItems(entries, rules, from, to);
    const due = dueOf(rules);
    const shown = withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, false)));
    expect(names(items)).toContain("Phone@2026-10-25");
    expect(names(shown)).not.toContain("Phone@2026-10-25");
    expect(names(shown)).toEqual(expect.arrayContaining(["Salary@2026-10-30", "Rent@2026-10-20", "Coffee", "Concert"]));
    expect(shown).toHaveLength(items.length - 1);
  });

  it("Week view: the same rule", () => {
    const [from, to] = periodOf("Week", T);
    const items = ledgerItems(entries, rules, from, to);
    const due = dueOf(rules);
    const shown = withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, false)));
    expect(names(items).some((n) => n.startsWith("Phone"))).toBe(from <= "2026-10-25" && to >= "2026-10-25");
    expect(names(shown).some((n) => n.startsWith("Phone"))).toBe(false);
    expect(names(shown)).toContain("Rent@2026-10-20");
  });

  it("Day view of today has nothing to hide", () => {
    const items = ledgerItems(entries, rules, T, T);
    const due = dueOf(rules);
    expect(withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, false)))).toEqual(items);
  });

  it("Search or a category filter hides the card, so nothing leaves the list", () => {
    const [from, to] = periodOf("Month", T);
    const items = ledgerItems(entries, rules, from, to);
    const due = dueOf(rules);
    expect(withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, true)))).toEqual(items);
  });

  it("a period without today keeps every row", () => {
    const [from, to] = periodOf("Month", "2026-11-15");
    const items = ledgerItems(entries, rules, from, to);
    const due = dueOf(rules);
    expect(withoutCardRows(items, nextCardKeys(due, cardVisible(false, due, false)))).toEqual(items);
    expect(names(items)).toContain("Laptop@2026-11-05");
  });

  it("the sixth and seventh payments stay in the day list", () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => plan(id, addDays(T, i + 1)));
    const [from, to] = periodOf("Month", T);
    const items = ledgerItems([], seven, from, to);
    const due = dueOf(seven);
    const shown = withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, false)));
    expect(names(shown)).toEqual(expect.arrayContaining([`f@${addDays(T, 6)}`, `g@${addDays(T, 7)}`]));
    expect(names(shown)).not.toContain(`a@${addDays(T, 1)}`);
  });

  it("only upcoming payments leave, so day totals do not change", () => {
    const [from, to] = periodOf("Month", T);
    const items = ledgerItems(entries, rules, from, to);
    const due = dueOf(rules);
    const shown = new Set(withoutCardRows(items, nextCardKeys(due, cardVisible(true, due, false))));
    const gone = items.filter((it) => !shown.has(it));
    expect(gone.length).toBeGreaterThan(0);
    for (const it of gone) expect(it.type === "occurrence" && it.date > T).toBe(true);
  });
});
