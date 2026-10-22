import { describe, expect, it } from "vitest";
import { applyPlanEdit, diffLines, diffPlan, patchOf } from "../src/data/planEdit";
import { cardStatus } from "../src/data/cards";
import { ledgerItems, occurrences } from "../src/data/rules";
import { buildSplit } from "../src/data/splits";
import type { Account, Rule } from "../src/data/schema";

// Made-up plans. Today is Oct 20, 2026.
const P = 100;
const TODAY = "2026-10-20";
const laptop: Rule = { id: "L", type: "installment", kind: "expense", amount: 2000 * P, total: 24000 * P, count: 12, currency: "PHP", category: "Shopping", note: "Laptop", accountId: "C", frequency: "monthly", start: "2026-09-09", updatedAt: "x" };
const phone: Rule = { id: "F", type: "recurring", kind: "expense", amount: 1000 * P, currency: "PHP", category: "Bills", note: "Phone plan", accountId: "B", frequency: "monthly", start: "2026-08-25", updatedAt: "x" };
const dates = (r: Rule, to = "2027-12-31") => occurrences(r, "0000-01-01", to).map((o) => o.date);
const fmt = (m: number) => `₱${(m / P).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

describe("applyPlanEdit", () => {
  it("moves an installment's start later, and earlier, keeping its payments", () => {
    const later = applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-10-12" });
    expect(dates(later).slice(0, 2)).toEqual(["2026-10-12", "2026-11-12"]);
    expect(dates(later)).toHaveLength(12);
    const earlier = applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-07-09" });
    expect(dates(earlier)[0]).toBe("2026-07-09");
  });

  it("moves a recurring plan's start, and drops revisions dated before the new start", () => {
    const revised: Rule = { ...phone, revisions: [{ from: "2026-09-25", amount: 1200 * P }, { from: "2026-12-25", amount: 1500 * P }] };
    const moved = applyPlanEdit(revised, { ...patchOf(revised), start: "2026-11-01" });
    expect(dates(moved, "2026-12-31")).toEqual(["2026-11-01", "2026-12-01"]);
    expect(moved.revisions).toEqual([{ from: "2026-12-25", amount: 1500 * P }]);
  });

  it("changes Payments and Total: the payments add up to the total and amount is the first payment", () => {
    const r = applyPlanEdit(laptop, { ...patchOf(laptop), count: 7, total: 10000 * P });
    const occ = occurrences(r, "0000-01-01", "2030-01-01");
    expect(occ).toHaveLength(7);
    expect(occ.reduce((a, o) => a + o.amount, 0)).toBe(10000 * P);
    expect(r.amount).toBe(occ[0]!.amount);
    expect([r.count, r.total]).toEqual([7, 10000 * P]);
  });

  it("keeps edited and skipped payments only on dates that are still payment dates", () => {
    const r: Rule = { ...phone, skipped: ["2026-09-25", "2026-11-25"], overrides: { "2026-10-25": { amount: 900 * P }, "2026-12-25": { note: "Roaming" } } };
    const moved = applyPlanEdit(r, { ...patchOf(r), start: "2026-10-25" });
    expect(moved.skipped).toEqual(["2026-11-25"]);
    expect(moved.overrides).toEqual({ "2026-10-25": { amount: 900 * P }, "2026-12-25": { note: "Roaming" } });
    const weekly = applyPlanEdit(r, { ...patchOf(r), frequency: "weekly" });
    expect(weekly.skipped).toEqual([]);
    expect(weekly.overrides).toEqual({});
  });

  it("an installment's split follows a new payment amount", () => {
    const split = buildSplit({ amount: 2000 * P, paidBy: "me", mode: "half", people: ["alex"] });
    const r = applyPlanEdit({ ...laptop, split }, { ...patchOf(laptop), count: 10 });
    expect(r.amount).toBe(2400 * P);
    expect(r.split).toEqual({ paidBy: "me", mode: "half", shares: [{ personId: "alex", amount: 1200 * P }] });
  });

  it("note, category and account apply to the whole plan, so later revisions lose those fields", () => {
    const revised: Rule = { ...phone, revisions: [{ from: "2026-12-25", amount: 1500 * P, note: "Old name", accountId: "B" }] };
    const r = applyPlanEdit(revised, { ...patchOf(revised), note: "Mobile", accountId: "B2" });
    expect([r.note, r.accountId]).toEqual(["Mobile", "B2"]);
    expect(r.revisions).toEqual([{ from: "2026-12-25", amount: 1500 * P }]);
  });

  it("an ends date can be set and cleared on a recurring plan", () => {
    const ended = applyPlanEdit(phone, { ...patchOf(phone), end: "2026-12-31" });
    expect(dates(ended).at(-1)).toBe("2026-12-25");
    expect(applyPlanEdit(ended, { ...patchOf(ended), end: "" }).end).toBeUndefined();
  });
});

describe("diffPlan: what the change does, before it is saved", () => {
  it("reports payments added in the past", () => {
    const d = diffPlan(laptop, applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-07-09" }), TODAY);
    // Jul 9 and Aug 9 are new and already past; the last two (Jul and Aug 2027) are no longer due.
    expect(d.addedPast.map((x) => x.date)).toEqual(["2026-07-09", "2026-08-09"]);
    expect(d.removedPast).toEqual([]);
    expect(d.changedFuture).toBe(2);
  });

  it("reports a payment already posted that goes away", () => {
    const d = diffPlan(laptop, applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-10-12" }), TODAY);
    // Sep 9 moves to Oct 12; Oct 9 has nothing to move to before today, so it leaves.
    expect(d.moved).toEqual([{ from: "2026-09-09", to: "2026-10-12" }]);
    expect(d.removedPast.map((x) => x.date)).toEqual(["2026-10-09"]);
  });

  it("reports moved payments, with the first one", () => {
    const d = diffPlan(phone, applyPlanEdit(phone, { ...patchOf(phone), start: "2026-08-28" }), TODAY);
    expect(d.moved[0]).toEqual({ from: "2026-08-25", to: "2026-08-28" });
    expect(d.postedMove).toBe(true);
  });

  it("future only, and nothing at all", () => {
    const d = diffPlan(phone, applyPlanEdit(phone, { ...patchOf(phone), end: "2027-03-31" }), TODAY);
    expect(d.addedPast.length + d.removedPast.length + d.moved.length).toBe(0);
    expect(d.changedFuture).toBeGreaterThan(0);
    expect(diffLines(d, { fmt })).toEqual([`Changes ${d.changedFuture} payments that have not happened yet.`]);
    const none = diffPlan(phone, applyPlanEdit(phone, patchOf(phone)), TODAY);
    expect(none.unchanged).toBe(true);
    expect(diffLines(none, { fmt })).toEqual(["No payments change."]);
  });

  it("counts edited and skipped payments that reset", () => {
    const r: Rule = { ...phone, skipped: ["2026-11-25"], overrides: { "2026-12-25": { amount: 900 * P } } };
    expect(diffPlan(r, applyPlanEdit(r, { ...patchOf(r), frequency: "weekly" }), TODAY).reset).toBe(2);
  });

  it("says it in words", () => {
    const d = diffPlan(laptop, applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-07-09" }), TODAY);
    const lines = diffLines(d, { fmt, card: "Card A" });
    expect(lines[0]).toBe("Adds 2 payments in the past: Jul 9 and Aug 9, ₱4,000.00 in all. They will count in Spent and on Card A's bills.");
    expect(lines).toContain("Payments already made move too.");
  });

  it("a card's statement and unbilled change as expected after the edit", () => {
    const card: Account = { id: "C", name: "Card A", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, dueDays: 20, updatedAt: "x" };
    const st = (r: Rule) => cardStatus(card, ledgerItems([], [r], "0000-01-01", TODAY), [r], TODAY);
    const before = st(laptop); // Sep 9 and Oct 9 are both on statements by the Oct 15 cut-off, nothing paid
    expect([before.statement, before.unbilled]).toEqual([4000 * P, 0]);
    const moved = applyPlanEdit(laptop, { ...patchOf(laptop), start: "2026-10-16" }); // first payment after the cut-off
    const after = st(moved);
    expect([after.statement, after.unbilled]).toEqual([0, 2000 * P]);
  });
});
