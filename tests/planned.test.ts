import { describe, expect, it } from "vitest";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { plannedSummary, summarize } from "../src/data/summary";

const t = "2026-10-01T00:00:00Z";
const today = "2026-10-19";
const e = (id: string, date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date, amount, currency: "PHP", createdAt: t, updatedAt: t, ...extra });
const half = (p: string, amount: number) => ({ paidBy: "me", mode: "half" as const, shares: [{ personId: p, amount: amount / 2 }] });

const rules: Rule[] = [
  { id: "stream", type: "recurring", kind: "expense", amount: 50000, currency: "PHP", category: "Bills", note: "Streaming", accountId: "C1", frequency: "monthly", start: "2026-01-05", updatedAt: t },
  { id: "laptop", type: "installment", kind: "expense", amount: 100000, total: 1200000, count: 12, currency: "PHP", category: "Shopping", note: "Laptop", accountId: "C1", frequency: "monthly", start: "2026-04-20", updatedAt: t },
  { id: "gym", type: "recurring", kind: "expense", amount: 20000, currency: "PHP", category: "Health", note: "Gym", accountId: "A1", frequency: "weekly", start: "2026-09-01", split: half("P1", 20000), updatedAt: t },
  { id: "salary", type: "income", kind: "income", amount: 5000000, currency: "PHP", category: "Salary", accountId: "A1", frequency: "monthly", start: "2026-01-25", updatedAt: t },
];
const entries: Entry[] = [
  e("lunch", "2026-10-03", 50000, { note: "Lunch", accountId: "A1", split: half("P1", 50000) }),
  e("groc", "2026-10-25", 80000, { note: "Groceries", category: "Groceries", accountId: "A1" }),
  e("concert", "2026-11-10", 300000, { note: "Concert", category: "Fun", accountId: "C1" }),
];
const live = ["A1", "C1"];

describe("plannedSummary", () => {
  it("a future month: plan payments, an installment, a future-dated entry and my share of a split; never salary", () => {
    const s = plannedSummary(ledgerItems(entries, rules, "2026-11-01", "2026-11-30"), "PHP", "2026-11-01", "2026-11-30", today, entries);
    // Streaming 500 + Laptop 1,000 + Concert 3,000 + Gym 4 weeks x my half 100
    expect(s.total).toBe(50000 + 100000 + 300000 + 40000);
    expect(s.planned).toBe(s.total);
    expect(s.byCategory.map((c) => [c.category, c.amount])).toEqual([["Fun", 300000], ["Shopping", 100000], ["Bills", 50000], ["Health", 40000]]);
    expect(s.byCategory.every((c) => c.top!.every((i) => i.planned))).toBe(true);
    expect(s.byDay[4]).toBe(50000); // Nov 5
  });

  it("the current month: spent so far plus the rest of the month, upcoming items marked", () => {
    const items = ledgerItems(entries, rules, "2026-10-01", "2026-10-31");
    const s = plannedSummary(items, "PHP", "2026-10-01", "2026-10-31", today, entries);
    // Spent: Lunch half 250 + Streaming 500 + Gym Oct 6 and 13 (100 each). Upcoming: Groceries 800, Gym Oct 20 and 27, Laptop 1,000.
    expect(s.total).toBe(95000 + 200000);
    expect(s.planned).toBe(200000);
    const spent = summarize(ledgerItems(entries, rules, "2026-10-01", today), "PHP", "2026-10-01", "2026-10-31", entries);
    expect(s.total - s.planned).toBe(spent.total);
    expect(s.byDay.slice(0, 19)).toEqual(spent.byDay.slice(0, 19));
    const health = s.byCategory.find((c) => c.category === "Health")!;
    expect(health.top!.map((i) => [i.date, !!i.planned])).toEqual([["2026-10-06", false], ["2026-10-13", false], ["2026-10-20", true]]);
    expect(s.byCategory.find((c) => c.category === "Shopping")!.top![0]).toMatchObject({ label: "Laptop", planned: true });
  });

  it("the account filter applies to planned items too", () => {
    const s = plannedSummary(ledgerItems(entries, rules, "2026-11-01", "2026-11-30"), "PHP", "2026-11-01", "2026-11-30", today, entries, { account: "C1", live });
    expect([s.total, s.planned]).toEqual([450000, 450000]); // Gym is on Bank A
  });

  it("summarize is unchanged: no planned field and no planned marks", () => {
    const s = summarize(ledgerItems(entries, rules, "2026-10-01", "2026-10-31"), "PHP", "2026-10-01", "2026-10-31", entries);
    expect("planned" in s).toBe(false);
    expect(s.byCategory.flatMap((c) => c.top ?? []).some((i) => i.planned)).toBe(false);
  });
});
