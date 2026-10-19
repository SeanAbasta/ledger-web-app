import { describe, expect, it } from "vitest";
import { perMonthOf, planList } from "../src/data/plans";
import type { Rule } from "../src/data/schema";

const t = "2026-10-01T00:00:00Z";
const today = "2026-10-19";
const rule = (id: string, x: Partial<Rule>): Rule => ({ id, type: "recurring", kind: "expense", amount: 100000, currency: "PHP", frequency: "monthly", start: "2026-01-05", updatedAt: t, ...x });

describe("planList", () => {
  it("monthly equivalents: weekly x 52 / 12, monthly as is, yearly / 12", () => {
    expect(perMonthOf(12000, "weekly")).toBe(52000);
    expect(perMonthOf(12000, "monthly")).toBe(12000);
    expect(perMonthOf(1200000, "yearly")).toBe(100000);
    expect(perMonthOf(1000, "weekly")).toBe(4333); // rounded
    const l = planList([
      rule("w", { note: "Gym", frequency: "weekly", amount: 12000, start: "2026-09-01" }),
      rule("m", { note: "Streaming", amount: 50000 }),
      rule("y", { note: "Insurance", frequency: "yearly", amount: 1200000, start: "2025-11-01" }),
    ], today, "PHP");
    expect(l.recurring.map((r) => [r.label, r.next!.date, r.monthly])).toEqual([
      ["Gym", "2026-10-20", 52000], ["Insurance", "2026-11-01", 100000], ["Streaming", "2026-11-05", 50000],
    ]);
    expect(l.perMonth).toBe(202000);
  });

  it("installments: progress (3 of 12, 9 left), and ended once paid off", () => {
    const l = planList([
      rule("i", { type: "installment", note: "Laptop", total: 1200000, count: 12, amount: 100000, start: "2026-07-20" }),
      rule("done", { type: "installment", note: "Phone", total: 300000, count: 3, amount: 100000, start: "2026-06-10" }),
    ], today, "PHP");
    expect(l.installments).toHaveLength(1);
    expect(l.installments[0]).toMatchObject({ label: "Laptop", amount: 100000, progress: { done: 3, count: 12, left: 9 } });
    expect(l.installments[0]!.next!.date).toBe("2026-10-20");
    expect(l.ended.map((r) => [r.label, r.progress, r.last!.date])).toEqual([["Phone", { done: 3, count: 3, left: 0 }, "2026-08-10"]]);
    expect(l.perMonth).toBe(100000);
  });

  it("an end date is shown, and a plan past its end is ended and not counted", () => {
    const l = planList([rule("e", { note: "Phone", end: "2026-12-05" }), rule("old", { note: "Old plan", end: "2026-06-30" })], today, "PHP");
    expect(l.recurring.map((r) => [r.label, r.end])).toEqual([["Phone", "2026-12-05"]]);
    expect(l.ended.map((r) => [r.label, r.last!.date])).toEqual([["Old plan", "2026-06-05"]]);
    expect(l.perMonth).toBe(100000);
  });

  it("a skipped payment moves the next date; a revision changes the amount and account", () => {
    const l = planList([rule("s", { note: "Rent", accountId: "A1", skipped: ["2026-11-05"], revisions: [{ from: "2026-12-05", amount: 120000, accountId: "A2" }] })], today, "PHP");
    expect(l.recurring[0]).toMatchObject({ amount: 120000, accountId: "A2", monthly: 120000 });
    expect(l.recurring[0]!.next!.date).toBe("2026-12-05");
  });

  it("a split counts at my share; a plan that starts later is active", () => {
    const l = planList([rule("sp", { note: "Gym", amount: 20000, start: "2027-01-01", split: { paidBy: "me", mode: "half", shares: [{ personId: "P1", amount: 10000 }] } })], today, "PHP");
    expect(l.recurring[0]).toMatchObject({ split: true, amount: 20000, monthly: 10000 });
    expect(l.recurring[0]!.next!.date).toBe("2027-01-01");
  });

  it("foreign plans cannot be converted (plans store no rate) and are counted", () => {
    const l = planList([rule("usd", { note: "Cloud", currency: "USD", amount: 1000 }), rule("php", { note: "Streaming", amount: 50000 })], today, "PHP");
    expect(l.recurring.map((r) => r.label)).toEqual(["Cloud", "Streaming"]);
    expect(l.recurring[0]!.monthly).toBeUndefined();
    expect([l.perMonth, l.unconverted]).toEqual([50000, 1]);
  });

  it("salary plans and removed plans are left out; the label falls back to the category", () => {
    const l = planList([
      rule("sal", { type: "income", kind: "income", category: "Salary", amount: 5000000 }),
      rule("gone", { note: "Gone", deleted: true }),
      rule("cat", { category: "Bills" }),
    ], today, "PHP");
    expect([...l.recurring, ...l.installments, ...l.ended].map((r) => r.label)).toEqual(["Bills"]);
  });
});
