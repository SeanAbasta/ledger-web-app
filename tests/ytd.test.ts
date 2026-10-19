import { describe, expect, it } from "vitest";
import { addMonths, monthEnd } from "../src/data/dates";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { summarize } from "../src/data/summary";
import { yearReport } from "../src/data/ytd";

const t = "2026-01-01T00:00:00Z";
const today = "2026-10-19";
let n = 0;
const e = (date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id: `e${++n}`, kind: "expense", date, amount, currency: "PHP", category: "Food", accountId: "A1", createdAt: t, updatedAt: t, ...extra });
const half = (amount: number) => ({ paidBy: "me", mode: "half" as const, shares: [{ personId: "P1", amount: amount / 2 }] });

const laptop = e("2026-03-10", 300000, { category: "Shopping", note: "Laptop bag", accountId: "C1", split: half(300000) });
const entries: Entry[] = [
  // Year boundary: the last day of 2025 and the first of 2026.
  e("2025-12-31", 70000), e("2026-01-01", 30000),
  e("2026-01-15", 100000, { note: "Lunch" }),
  e("2026-01-20", 1000, { currency: "USD" }), // no rate: left out and counted
  e("2026-02-14", 200000, { category: "Groceries", split: half(200000) }), // my half: 1,000
  laptop,
  e("2026-03-20", 100000, { kind: "income", refund: true, refundOf: laptop.id, category: "Shopping", accountId: "C1" }), // my half of it: 500 back
  e("2026-04-05", 200000, { kind: "transfer", category: "Card payment", accountId: "A1", toAccountId: "C1" }),
  e("2026-04-06", 150000, { kind: "transfer", category: "Transfer", accountId: "A1", toAccountId: "A2" }),
  e("2026-05-02", 50000, { kind: "settlement", category: "Settlement", personId: "P1", direction: "in" }),
  e("2026-01-05", 5000000, { kind: "income", category: "Salary" }),
  e("2026-06-12", 500000, { kind: "income", category: "Gift" }),
  e("2026-11-10", 300000, { note: "Concert", category: "Fun" }), // after today
  e("2026-02-01", 999999, { deleted: true }),
  // Last year: the same period ends on Oct 19, 2025.
  e("2025-03-03", 400000), e("2025-10-19", 10000), e("2025-10-20", 90000),
];
const rules: Rule[] = [
  { id: "stream", type: "recurring", kind: "expense", amount: 50000, currency: "PHP", category: "Bills", note: "Streaming", accountId: "C1", frequency: "monthly", start: "2026-01-05", updatedAt: t },
  { id: "inst", type: "installment", kind: "expense", amount: 100000, total: 1200000, count: 12, currency: "PHP", category: "Shopping", note: "Laptop", accountId: "C1", frequency: "monthly", start: "2026-04-20", updatedAt: t },
  { id: "salary", type: "income", kind: "income", amount: 5000000, currency: "PHP", category: "Salary", accountId: "A1", frequency: "monthly", start: "2026-07-25", updatedAt: t },
];
const r = yearReport({ entries, rules, base: "PHP", year: 2026, today });

describe("yearReport", () => {
  it("adds up month by month (my share, refunds subtract, plans in past months)", () => {
    expect(r.months.map((m) => m.spent / 100)).toEqual([
      1800, // Jan: Jan 1 300 + Lunch 1,000 + Streaming 500 (the USD one left out)
      1500, // Feb: my half of Groceries 1,000 + Streaming 500
      1500, // Mar: my half of the bag 1,500 - my half of the refund 500 + Streaming 500
      1500, 1500, 1500, 1500, 1500, 1500, // Apr to Sep: Streaming 500 + Laptop 1,000
      500, // Oct: Streaming on Oct 5; Laptop on Oct 20 is after today
      0, 0, // Nov and Dec have not happened; the Concert is not counted
    ]);
    expect(r.spent).toBe(r.months.reduce((a, m) => a + m.spent, 0));
    expect(r.spent).toBe(1430000);
    expect(r.categories.reduce((a, c) => a + c.amount, 0)).toBe(r.spent);
    expect(r.unconverted).toBe(1);
  });

  it("each month equals the Dashboard's figure for that month", () => {
    for (let i = 0; i < 10; i++) {
      const from = addMonths("2026-01-01", i);
      const to = monthEnd(from) < today ? monthEnd(from) : today;
      expect(r.months[i]!.spent).toBe(summarize(ledgerItems(entries, rules, from, to), "PHP", from, monthEnd(from), entries).total);
    }
  });

  it("income: entries that are not refunds plus salary plan payments up to today; never transfers or settlements", () => {
    expect(r.months.map((m) => m.income / 100)).toEqual([50000, 0, 0, 0, 0, 5000, 50000, 50000, 50000, 0, 0, 0]);
    expect(r.income).toBe(20500000);
    expect(r.net).toBe(20500000 - 1430000);
  });

  it("average, highest and lowest over the months that have happened", () => {
    expect(r.average).toBe(143000);
    expect(r.highest).toEqual({ month: "2026-01-01", amount: 180000 });
    expect(r.lowest).toEqual({ month: "2026-10-01", amount: 50000 });
    expect(r.months.filter((m) => m.happened)).toHaveLength(10);
  });

  it("compares with the same dates last year", () => {
    expect([r.from, r.to]).toEqual(["2026-01-01", today]);
    expect(r.lastYear).toEqual({ spent: 410000, change: 249 }); // Mar 3 and Oct 19, 2025, not Oct 20
  });

  it("a past year is the whole year; with no earlier data there is no comparison", () => {
    const p = yearReport({ entries, rules, base: "PHP", year: 2025, today });
    expect([p.to, p.spent, p.lastYear, p.future, p.empty]).toEqual(["2025-12-31", 570000, undefined, false, false]);
    expect(p.months.every((m) => m.happened)).toBe(true);
  });

  it("a future year shows nothing yet; an empty year is empty", () => {
    const f = yearReport({ entries, rules, base: "PHP", year: 2027, today });
    expect([f.future, f.empty, f.spent, f.income, f.categories]).toEqual([true, true, 0, 0, []]);
    const z = yearReport({ entries, rules, base: "PHP", year: 2020, today });
    expect([z.future, z.empty]).toEqual([false, true]);
  });

  it("the comparison handles Feb 29", () => {
    const leap = yearReport({ entries: [e("2027-02-28", 1000), e("2028-01-10", 1000)], rules: [], base: "PHP", year: 2028, today: "2028-02-29" });
    expect(leap.lastYear).toEqual({ spent: 1000, change: 0 });
  });
});
