import { describe, expect, it } from "vitest";
import type { Account, Trip, TripItem } from "../src/data/schema";
import { buildSplit } from "../src/data/splits";
import { againstEstimate, baseOf, budgetLeft, concludedByCard, concludePlan, concludeSummary, dayRail, daysLeft, isFinal, owedLines, perDay, phaseText, rebuildSplit, tripEnd, tripPhase, tripTotals, waitingText } from "../src/data/tripMath";

const T = "2026-10-01T00:00:00.000Z";
const trip: Trip = { id: "t1", name: "Trip A", start: "2026-09-28", days: 7, budget: 5000000, rates: { JPY: "0.37" }, status: "open", updatedAt: T };
let n = 0;
const item = (o: Partial<TripItem> = {}): TripItem => ({ id: `i${++n}`, tripId: "t1", date: "2026-09-28", amount: 10000, currency: "JPY", category: "Food", accountId: "cardA", createdAt: T, updatedAt: T, ...o });
const acct = (id: string, name: string, o: Partial<Account> = {}): Account => ({ id, name, currency: "PHP", openingBalance: 0, updatedAt: T, ...o });
const accounts = [acct("cardA", "Card A", { type: "card", statementDay: 5 }), acct("bankA", "Bank A")];
const ids = () => { let k = 0; return () => `E${++k}`; };

describe("one item", () => {
  it("estimates with its own rate, else the trip's, and uses the figure once typed", () => {
    expect(baseOf(item({ amount: 12345 }), trip, "PHP")).toBe(456765); // 12,345 yen at 0.37
    expect(baseOf(item({ amount: 12345, rate: "0.4" }), trip, "PHP")).toBe(493800);
    expect(baseOf(item({ amount: 12345, final: 456789 }), trip, "PHP")).toBe(456789);
    expect(baseOf(item({ currency: "USD" }), trip, "PHP")).toBeUndefined();
    expect(baseOf(item({ currency: "PHP", amount: 5000 }), trip, "PHP")).toBe(5000);
  });

  it("is Final only with a typed figure, or when already in the base currency", () => {
    expect(isFinal(item(), "PHP")).toBe(false);
    expect(isFinal(item({ final: 100 }), "PHP")).toBe(true);
    expect(isFinal(item({ currency: "PHP" }), "PHP")).toBe(true);
  });
});

describe("totals", () => {
  it("adds up spending, takes refunds off, and counts Final per card and category", () => {
    const dinner = item({ id: "d", amount: 10000, final: 372000 });
    const taxi = item({ amount: 5000, category: "Transport", accountId: "bankA" });
    const back = item({ refund: true, refundOf: "d", amount: 1000, final: 37000 });
    const t = tripTotals(trip, [dinner, taxi, back, item({ deleted: true })], "PHP");
    expect(t.paid).toBe(372000 + 185000 - 37000);
    expect(t.count).toBe(3);
    expect(t.final).toBe(2);
    expect(t.byCard).toEqual([{ accountId: "bankA", paid: 185000, count: 1, final: 0 }, { accountId: "cardA", paid: 335000, count: 2, final: 2 }]);
    expect(t.byCategory).toEqual([{ category: "Food", paid: 335000 }, { category: "Transport", paid: 185000 }]);
  });

  it("counts my share of a split, and my part of its refund in the same proportion", () => {
    const split = buildSplit({ amount: 10000, paidBy: "me", mode: "half", people: ["alex"] });
    const dinner = item({ id: "d", final: 400000, split });
    const back = item({ refund: true, refundOf: "d", amount: 5000, final: 200000 });
    const t = tripTotals(trip, [dinner, back], "PHP");
    expect(t.paid).toBe(200000);
    expect(t.mine).toBe(100000);
  });

  it("leaves out a foreign item with no rate and says so", () => {
    const t = tripTotals(trip, [item({ currency: "EUR" })], "PHP");
    expect(t).toMatchObject({ paid: 0, unrated: 1, count: 1 });
  });
});

describe("budget and days", () => {
  it("shows what is left and a figure per day", () => {
    const totals = { mine: 2000000 };
    expect(budgetLeft(trip, totals)).toBe(3000000);
    expect(budgetLeft({ budget: undefined }, totals)).toBeUndefined();
    expect(tripEnd(trip)).toBe("2026-10-04");
    expect(daysLeft(trip, "2026-09-20")).toBe(7);
    expect(daysLeft(trip, "2026-10-02")).toBe(3);
    expect(daysLeft(trip, "2026-10-04")).toBe(1);
    expect(daysLeft(trip, "2026-10-05")).toBe(0);
    expect(perDay(trip, totals, "2026-10-02")).toBe(1000000);
    expect(perDay(trip, totals, "2026-10-05")).toBeUndefined();
    expect(perDay(trip, { mine: 9000000 }, "2026-10-02")).toBe(0); // over budget: never negative
  });
});

describe("rebuilding a split for the final amount", () => {
  it("half and they-owe are rebuilt with the same people", () => {
    const half = buildSplit({ amount: 1000, paidBy: "me", mode: "half", people: ["alex", "sam"] });
    expect(rebuildSplit(half, 1000, 1001)).toEqual(buildSplit({ amount: 1001, paidBy: "me", mode: "half", people: ["alex", "sam"] }));
    const owe = buildSplit({ amount: 1000, paidBy: "alex", mode: "i-owe", people: [] });
    expect(rebuildSplit(owe, 1000, 1200).shares).toEqual([{ personId: "me", amount: 1200 }]);
  });

  it("custom shares keep their proportions, add up as before, and never exceed the amount", () => {
    const custom = buildSplit({ amount: 1000, paidBy: "me", mode: "custom", people: [], custom: [{ personId: "alex", amount: 333 }, { personId: "sam", amount: 333 }] });
    const out = rebuildSplit(custom, 1000, 1100);
    expect(out.mode).toBe("custom");
    const sum = out.shares.reduce((a, s) => a + s.amount, 0);
    expect(sum).toBe(Math.round((666 * 1100) / 1000)); // 733
    expect(out.shares.map((s) => s.amount)).toEqual([367, 366]); // the spare centavo goes to the earlier share
    const all = buildSplit({ amount: 3, paidBy: "me", mode: "custom", people: [], custom: [{ personId: "alex", amount: 1 }, { personId: "sam", amount: 1 }, { personId: "kim", amount: 1 }] });
    expect(rebuildSplit(all, 3, 1).shares.reduce((a, s) => a + s.amount, 0)).toBeLessThanOrEqual(1);
  });
});

describe("Conclude", () => {
  const dinner = (o: Partial<TripItem> = {}) => item({ id: "d", amount: 12345, final: 456789, note: "Dinner", ...o });

  it("is blocked while a foreign item has no statement figure, and says where", () => {
    const plan = concludePlan(trip, [dinner(), item({ id: "x" }), item({ id: "y", accountId: "bankA" }), item({ id: "z" })], accounts, "PHP", T, ids());
    expect(plan.entries).toEqual([]);
    expect(plan.waiting).toEqual([{ accountId: "cardA", count: 2 }, { accountId: "bankA", count: 1 }]);
    expect(plan.problems).toEqual(["3 still need a statement amount: Card A 2, Bank A 1"]);
    expect(waitingText([{ accountId: "bankA", count: 1 }], accounts)).toBe("1 still needs a statement amount: Bank A 1");
  });

  it("posts base-currency entries with the statement figure and keeps the local price", () => {
    const pesos = item({ id: "p", currency: "PHP", amount: 25000, category: "Transport", accountId: "bankA", date: "2026-09-27" });
    const plan = concludePlan(trip, [dinner(), pesos], accounts, "PHP", T, ids());
    expect(plan.problems).toEqual([]);
    expect(plan.entries.map((e) => [e.date, e.amount, e.currency])).toEqual([["2026-09-27", 25000, "PHP"], ["2026-09-28", 456789, "PHP"]]);
    expect(plan.entries[1]).toMatchObject({ kind: "expense", tripId: "t1", note: "Dinner", category: "Food", accountId: "cardA", local: { amount: 12345, currency: "JPY" }, createdAt: T, updatedAt: T });
    expect(plan.entries[1]!.rate).toBeUndefined();
    expect(plan.entries[0]!.local).toBeUndefined();
  });

  it("rebuilds a split on the final amount, so people owe base currency with the fee in it", () => {
    const split = buildSplit({ amount: 12345, paidBy: "me", mode: "half", people: ["alex"] });
    const plan = concludePlan(trip, [dinner({ split })], accounts, "PHP", T, ids());
    expect(plan.entries[0]!.split).toEqual({ paidBy: "me", mode: "half", shares: [{ personId: "alex", amount: 228394 }] });
    expect(concludeSummary(plan.entries).owed).toEqual([{ personId: "alex", amount: 228394 }]);
  });

  it("points a refund at the new entry of its expense", () => {
    const back = item({ id: "r", refund: true, refundOf: "d", amount: 2000, final: 74000, date: "2026-10-02" });
    const plan = concludePlan(trip, [dinner(), back], accounts, "PHP", T, ids());
    const [expense, refund] = plan.entries;
    expect(refund).toMatchObject({ kind: "income", refund: true, refundOf: expense!.id, amount: 74000, tripId: "t1" });
    expect(refund!.split).toBeUndefined();
    expect(concludeSummary(plan.entries)).toMatchObject({ count: 2, from: "2026-09-28", to: "2026-10-02", paid: 456789 - 74000 });
  });

  it("refuses an empty trip, a refund with nothing to refund, and a refund bigger than its expense", () => {
    expect(concludePlan(trip, [], accounts, "PHP", T, ids()).problems).toEqual(["There is nothing in this trip to conclude"]);
    const orphan = item({ refund: true, refundOf: "gone", final: 100 });
    expect(concludePlan(trip, [orphan], accounts, "PHP", T, ids()).problems).toContain("A refund belongs to an expense that is no longer in the trip");
    const big = item({ id: "r", refund: true, refundOf: "d", amount: 9000, final: 999999 });
    expect(concludePlan(trip, [dinner(), big], accounts, "PHP", T, ids()).problems).toContain("A refund is larger than the expense it refunds");
  });

  it("refuses items with no account, on a removed account, or on a foreign-currency account", () => {
    const none = concludePlan(trip, [dinner({ accountId: undefined })], accounts, "PHP", T, ids());
    expect(none.problems).toEqual(["1 expense has no card or account"]);
    const gone = concludePlan(trip, [dinner()], [acct("cardA", "Card A", { deleted: true }), acct("bankA", "Bank A")], "PHP", T, ids());
    expect(gone.problems).toEqual(["1 expense is on a card or account you removed"]);
    const usd = concludePlan(trip, [dinner({ accountId: "usd" })], [...accounts, acct("usd", "USD Bank", { currency: "USD" })], "PHP", T, ids());
    expect(usd.problems).toEqual(["USD Bank is not in PHP; move those to a PHP account"]);
  });

  it("lets a split someone else paid have no account", () => {
    const split = buildSplit({ amount: 12345, paidBy: "alex", mode: "i-owe", people: [] });
    const plan = concludePlan(trip, [dinner({ accountId: undefined, split })], accounts, "PHP", T, ids());
    expect(plan.problems).toEqual([]);
    expect(plan.entries[0]!.accountId).toBeUndefined();
    expect(concludeSummary(plan.entries).owed).toEqual([{ personId: "alex", amount: -456789 }]);
  });

  it("ignores deleted items and other trips' items", () => {
    const plan = concludePlan(trip, [dinner(), dinner({ id: "o", tripId: "other" }), dinner({ id: "g", deleted: true })], accounts, "PHP", T, ids());
    expect(plan.entries).toHaveLength(1);
  });
});

describe("what People will show", () => {
  it("words who owes whom", () => {
    const fmt = (n: number) => `P${n / 100}`;
    expect(owedLines([{ personId: "a", amount: 25000 }, { personId: "b", amount: -1000 }], [{ id: "a", name: "Alex" }, { id: "b", name: "Sam" }], fmt)).toEqual(["Alex owes you P250", "You owe Sam P10"]);
  });
});

describe("the trip header", () => {
  it("says where today falls", () => {
    expect(tripPhase(trip, "2026-09-26")).toEqual({ kind: "before", days: 2 });
    expect(tripPhase(trip, "2026-09-28")).toEqual({ kind: "during", day: 1 });
    expect(tripPhase(trip, "2026-10-04")).toEqual({ kind: "during", day: 7 });
    expect(tripPhase(trip, "2026-10-05")).toEqual({ kind: "after" });
    expect(phaseText(trip, "2026-09-27")).toBe("Starts tomorrow");
    expect(phaseText(trip, "2026-09-20")).toBe("Starts in 8 days");
    expect(phaseText(trip, "2026-09-30")).toBe("Day 3 of 7");
    expect(phaseText(trip, "2026-11-01")).toBe("Ended Oct 4");
  });

  it("shades one cell per day by spending against the highest day, and marks today", () => {
    const items = [
      item({ date: "2026-09-28", amount: 10000, final: 400000 }),
      item({ date: "2026-09-29", amount: 10000, final: 100000 }),
      item({ date: "2026-09-29", refund: true, refundOf: "x", amount: 1000, final: 10000 }),
      item({ date: "2026-09-30", currency: "PHP", amount: 5000 }),
      item({ date: "2026-09-28", amount: 10000, final: 999, deleted: true }),
    ];
    const rail = dayRail(trip, items, "PHP", "2026-09-30");
    expect(rail).toHaveLength(7);
    expect(rail.map((c) => c.level)).toEqual([4, 2, 1, 0, 0, 0, 0]);
    expect(rail.map((c) => c.state)).toEqual(["past", "past", "today", "later", "later", "later", "later"]);
    expect(rail[0]!.date).toBe("2026-09-28");
    expect(dayRail(trip, [], "PHP", "2026-09-30").every((c) => c.level === 0)).toBe(true);
  });

  it("adds up a concluded trip per card, refunds taken off", () => {
    const rows = concludedByCard([{ amount: 500, accountId: "a" }, { amount: 200, accountId: "b" }, { amount: 100, refund: true, accountId: "a" }, { amount: 50 }]);
    expect(rows).toEqual([{ accountId: "a", paid: 400, count: 2 }, { accountId: "b", paid: 200, count: 1 }, { accountId: "none", paid: 50, count: 1 }]);
  });

  it("words a typed figure against its estimate", () => {
    const fmt = (n: number) => `P${n / 100}`;
    expect(againstEstimate(460050, 456765, fmt)).toBe("P32.85 more than the estimate");
    expect(againstEstimate(450000, 456765, fmt)).toBe("P67.65 less than the estimate");
    expect(againstEstimate(456765, 456765, fmt)).toBe("Same as the estimate");
    expect(againstEstimate(100, undefined, fmt)).toBe("");
  });
});
