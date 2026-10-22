import { describe, expect, it } from "vitest";
import { comingUp } from "../src/data/comingUp";
import { forecast } from "../src/data/forecast";
import { addMonths, monthEnd, monthStart } from "../src/data/dates";
import type { Account, Entry, Rule } from "../src/data/schema";

// Made-up data. Card A cuts off on the 15th and is due 20 days later (the Oct 15 statement is due Nov 4).
const P = 100;
const e = (id: string, date: string, pesos: number, extra: Partial<Entry> = {}): Entry => ({
  id, kind: "expense", date, amount: pesos * P, currency: "PHP", category: "Food", note: id, accountId: "C", createdAt: id, updatedAt: "x", ...extra,
});
const bank: Account = { id: "B", name: "Bank A", currency: "PHP", openingBalance: 50000 * P, updatedAt: "x" };
const card: Account = { id: "C", name: "Card A", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, dueDays: 20, updatedAt: "x" };
const half = (pesos: number) => ({ paidBy: "me", mode: "half" as const, shares: [{ personId: "alex", amount: (pesos * P) / 2 }] });
const streaming: Rule = { id: "S", type: "recurring", kind: "expense", amount: 500 * P, currency: "PHP", category: "Fun", note: "Streaming", accountId: "C", frequency: "monthly", start: "2026-10-25", split: half(500), updatedAt: "x" };
const phone: Rule = { id: "F", type: "recurring", kind: "expense", amount: 1000 * P, currency: "PHP", category: "Bills", note: "Phone plan", accountId: "B", frequency: "monthly", start: "2026-09-28", updatedAt: "x" };
const laptop: Rule = { id: "L", type: "installment", kind: "expense", amount: 2000 * P, total: 24000 * P, count: 12, currency: "PHP", category: "Shopping", note: "Laptop", accountId: "C", frequency: "monthly", start: "2026-10-20", updatedAt: "x" };
const TODAY = "2026-10-20";
const entries = [e("Coffee", "2026-10-10", 300), e("Lunch", "2026-10-16", 1200, { split: half(1200) }), e("Taxi", "2026-11-02", 400)];
const rules = [streaming, phone, laptop];
const accounts = [bank, card];
const run = (over: Partial<Parameters<typeof comingUp>[0]> = {}) => comingUp({ today: TODAY, base: "PHP", entries, rules, accounts, ...over });

describe("comingUp: what leaves the bank, and when", () => {
  it("I1: the card bills due in a month add up to that month's Card bills in the forecast", () => {
    const end = monthEnd(addMonths(monthStart(TODAY), 11));
    const c = run({ horizon: end });
    const f = forecast({ start: 0, today: TODAY, base: "PHP", entries, rules, accounts });
    for (const m of f.months) {
      const sum = c.cardBills.filter((b) => monthStart(b.due) === m.month).reduce((a, b) => a + b.amount, 0);
      expect(sum).toBe(m.cards);
    }
    expect(f.months.some((m) => m.cards > 0)).toBe(true);
  });

  it("I2: no plan payment or entry appears in two groups", () => {
    const c = run();
    const keys = [...c.bills.filter((b) => b.kind === "pay").map((b) => b.key), ...c.charges.map((x) => x.key)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(c.charges.every((x) => x.cardId === "C")).toBe(true);
    expect(c.bills.filter((b) => b.kind === "pay").every((b) => b.accountId !== "C")).toBe(true);
  });

  it("I3: a paid statement is in no total and shows as Paid until its due date", () => {
    const paid = e("Pay", "2026-10-18", 300, { kind: "transfer", accountId: "B", toAccountId: "C", category: "Card payment" });
    const c = run({ entries: [...entries, paid] });
    expect(c.paid).toEqual([{ cardId: "C", amount: 300 * P, due: "2026-11-04" }]);
    expect(c.bills.some((b) => b.kind === "bill" && b.due === "2026-11-04")).toBe(false);
    const unpaid = run();
    const bill = unpaid.bills.find((b) => b.kind === "bill" && b.due === "2026-11-04");
    expect(bill).toMatchObject({ amount: 300 * P, estimate: false });
    expect(unpaid.total - c.total).toBe(300 * P);
    // After its due date the Paid line leaves.
    expect(run({ entries: [...entries, paid], today: "2026-11-05" }).paid).toEqual([]);
  });

  it("I4: a charge dated today is in the Ledger, not in Scheduled charges", () => {
    const c = run(); // the Laptop's first payment is today
    expect(c.charges.some((x) => x.key === "L@2026-10-20")).toBe(false);
    expect(c.charges.every((x) => x.date > TODAY)).toBe(true);
    // A day later it would be scheduled.
    expect(run({ today: "2026-10-19" }).charges.some((x) => x.key === "L@2026-10-20")).toBe(true);
  });

  it("I5: Bills in 30 days is the sum of the bills dated inside the window", () => {
    const c = run();
    expect(c.until).toBe("2026-11-19");
    const sum = c.bills.reduce((a, b) => a + (b.kind === "bill" ? b.amount : b.yours ?? 0), 0);
    expect(c.total).toBe(sum);
    expect(c.bills.every((b) => b.date > TODAY && b.date <= c.until)).toBe(true);
    // The phone plan comes out of the bank on its own date, at my share.
    expect(c.bills.find((b) => b.kind === "pay" && b.key === "F@2026-10-28")).toMatchObject({ yours: 1000 * P });
  });

  it("I6: removing a plan takes its charge out of Scheduled charges and its bill estimate down by the same", () => {
    const withIt = run({ horizon: "2027-01-31" });
    const without = run({ horizon: "2027-01-31", rules: [phone, laptop] });
    const charge = withIt.charges.find((x) => x.key === "S@2026-10-25")!;
    expect(charge).toMatchObject({ amount: 500 * P, yours: 250 * P, billDue: "2026-12-05" });
    expect(without.charges.some((x) => x.key.startsWith("S@"))).toBe(false);
    const bill = (c: typeof withIt) => c.cardBills.find((b) => b.due === "2026-12-05")!.amount;
    expect(bill(withIt) - bill(without)).toBe(250 * P);
  });

  it("estimates say so until the cut-off has passed, and the next bill after the window is named", () => {
    const c = run();
    expect(c.next).toMatchObject({ cardId: "C", due: "2026-12-05", estimate: true });
    expect(c.cardBills.find((b) => b.due === "2026-11-04")!.estimate).toBe(false);
  });

  it("an unpaid statement past its due date is due now (tomorrow, as the forecast assumes)", () => {
    const c = run({ today: "2026-11-06" });
    const late = c.bills.find((b) => b.kind === "bill" && b.overdue);
    expect(late).toMatchObject({ due: "2026-11-07", amount: 300 * P });
  });

  it("scheduled charges keep the full price and say which bill they land on; future-dated entries count", () => {
    const c = run();
    expect(c.charges.find((x) => x.key === "Taxi")).toMatchObject({ amount: 400 * P, yours: 400 * P, billDue: "2026-12-05", date: "2026-11-02" });
  });
});
