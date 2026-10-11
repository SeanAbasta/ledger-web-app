import { describe, expect, it } from "vitest";
import { dailyStats, pctChange, summarize, topCategories } from "../src/data/summary";
import { myShare } from "../src/data/splits";
import { daysBetween } from "../src/data/dates";
import type { LedgerItem } from "../src/data/rules";
import type { Entry } from "../src/data/schema";

const e = (date: string, amount: number, extra: Partial<Entry> = {}): LedgerItem => ({
  type: "entry", date,
  entry: { id: date + amount, kind: "expense", date, amount, currency: "PHP", category: "Food", createdAt: "x", updatedAt: "x", ...extra },
});

describe("myShare", () => {
  it("is the whole amount without a split", () => expect(myShare(1000)).toBe(1000));
  it("is what is left after others' shares when I paid", () => {
    expect(myShare(1000, { paidBy: "me", mode: "half", shares: [{ personId: "a", amount: 500 }] })).toBe(500);
    expect(myShare(1000, { paidBy: "me", mode: "they-owe", shares: [{ personId: "a", amount: 1000 }] })).toBe(0);
  });
  it("is my share when someone else paid", () => {
    expect(myShare(1000, { paidBy: "a", mode: "i-owe", shares: [{ personId: "me", amount: 1000 }] })).toBe(1000);
    expect(myShare(1000, { paidBy: "a", mode: "half", shares: [{ personId: "me", amount: 500 }] })).toBe(500);
  });
});

describe("summarize", () => {
  it("totals by category and day in the base currency, using my share", () => {
    const s = summarize(
      [
        e("2026-10-01", 1000),
        e("2026-10-01", 500, { category: "Rent" }),
        e("2026-10-03", 2000, { split: { paidBy: "me", mode: "half", shares: [{ personId: "a", amount: 1000 }] } }),
        e("2026-10-03", 100, { kind: "income" }),
        e("2026-10-04", 100, { currency: "USD", rate: "56" }),
      ],
      "PHP", "2026-10-01", "2026-10-31",
    );
    expect(s.total).toBe(1000 + 500 + 1000 + 5600);
    expect(s.byDay.length).toBe(31);
    expect(s.byDay[0]).toBe(1500);
    expect(s.byDay[2]).toBe(1000);
    expect(s.byCategory[0]).toEqual({ category: "Food", amount: 7600 });
  });
  it("leaves out foreign amounts with no rate and counts them", () => {
    const s = summarize([e("2026-10-01", 100, { currency: "USD" })], "PHP", "2026-10-01", "2026-10-31");
    expect(s.total).toBe(0);
    expect(s.unconverted).toBe(1);
  });
});

describe("helpers", () => {
  it("folds small categories into Other", () => {
    const cats = ["a", "b", "c", "d", "e", "f", "g"].map((category, i) => ({ category, amount: 100 - i }));
    const t = topCategories(cats, 5);
    expect(t.map((c) => c.category)).toEqual(["a", "b", "c", "d", "e", "Other"]);
    expect(t[5]!.amount).toBe(95 + 94);
  });
  it("computes percent change", () => {
    expect(pctChange(90, 100)).toBe(-10);
    expect(pctChange(100, 0)).toBeNull();
  });
  it("counts days", () => expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30));
});

describe("dailyStats", () => {
  it("averages over the days that have happened, names the highest day and counts quiet days", () => {
    // Day 6 onwards has not happened yet, so the zeros there are not quiet days.
    const s = dailyStats([1000, 0, 3000, 0, 500, 0, 0, 0], 5);
    expect(s).toEqual({ average: 900, peak: { index: 2, amount: 3000 }, quietDays: 2 });
  });
  it("takes the earliest day on a tie", () => {
    expect(dailyStats([200, 700, 700], 3).peak).toEqual({ index: 1, amount: 700 });
  });
  it("a refund day lowers the average, is never the peak and is not quiet", () => {
    const s = dailyStats([-400, 1000, 0], 3);
    expect(s).toEqual({ average: 200, peak: { index: 1, amount: 1000 }, quietDays: 1 });
  });
  it("has no peak and a zero average with nothing spent or no days yet", () => {
    expect(dailyStats([0, 0, 0], 3)).toEqual({ average: 0, peak: undefined, quietDays: 3 });
    expect(dailyStats([0, 0, 0], 0)).toEqual({ average: 0, peak: undefined, quietDays: 0 });
  });
});
