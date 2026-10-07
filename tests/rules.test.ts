import { describe, expect, it } from "vitest";
import { addDays, addMonths, labelDay, monthKeysBetween, weekStart } from "../src/data/dates";
import { ledgerItems, occurrences } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { buildSplit } from "../src/data/splits";

const rule = (r: Partial<Rule>): Rule => ({
  id: "R1", type: "recurring", kind: "expense", amount: 1800000, currency: "PHP",
  frequency: "monthly", start: "2026-01-31", updatedAt: "x", ...r,
});

describe("dates", () => {
  it("adds days and months with clamping from the anchor", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("finds week start (Monday) and labels", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(labelDay("2026-10-07")).toBe("Wed Oct 7");
  });
  it("lists month keys", () => {
    expect(monthKeysBetween("2026-11-20", "2027-02-03")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});

describe("occurrences", () => {
  it("generates monthly dates, clamping then returning to the anchor day", () => {
    const o = occurrences(rule({}), "2026-01-01", "2026-04-30");
    expect(o.map((x) => x.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("respects range, end date, skips and overrides", () => {
    const r = rule({ start: "2026-01-05", end: "2026-04-05", skipped: ["2026-03-05"], overrides: { "2026-02-05": { amount: 2000000 } } });
    const o = occurrences(r, "2026-02-01", "2026-12-31");
    expect(o.map((x) => [x.date, x.amount])).toEqual([["2026-02-05", 2000000], ["2026-04-05", 1800000]]);
  });
  it("weekly and yearly", () => {
    expect(occurrences(rule({ frequency: "weekly", start: "2026-10-01" }), "2026-10-01", "2026-10-22").length).toBe(4);
    expect(occurrences(rule({ frequency: "yearly", start: "2024-02-29" }), "2024-01-01", "2028-12-31").map((x) => x.date))
      .toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });
  it("installments end by themselves, sum to the total, and track what is left", () => {
    const r = rule({ type: "installment", total: 10000, count: 3, amount: 3334, start: "2026-10-15" });
    const o = occurrences(r, "2026-01-01", "2030-01-01");
    expect(o.map((x) => x.amount)).toEqual([3334, 3333, 3333]);
    expect(o.map((x) => [x.index, x.count])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(o.map((x) => x.remainingAfter)).toEqual([6666, 3333, 0]);
  });
  it("ignores deleted rules", () => {
    expect(occurrences(rule({ deleted: true }), "2026-01-01", "2027-01-01")).toEqual([]);
  });
});

describe("ledgerItems", () => {
  it("merges entries and occurrences, newest first, excluding tombstones", () => {
    const e = (id: string, date: string, deleted = false): Entry => ({
      id, kind: "expense", date, amount: 100, currency: "PHP", createdAt: "x", updatedAt: "x", ...(deleted ? { deleted: true as const } : {}),
    });
    const items = ledgerItems([e("a", "2026-10-07"), e("b", "2026-10-02", true), e("c", "2026-09-30")], [rule({ start: "2026-10-12" })], "2026-10-01", "2026-10-31");
    expect(items.map((i) => i.date)).toEqual(["2026-10-12", "2026-10-07"]);
  });
});

describe("buildSplit", () => {
  it("they-owe divides the whole amount among the people", () => {
    const s = buildSplit({ amount: 1001, paidBy: "me", mode: "they-owe", people: ["maya", "jon"] });
    expect(s.shares).toEqual([{ personId: "maya", amount: 501 }, { personId: "jon", amount: 500 }]);
  });
  it("i-owe makes me owe the payer everything", () => {
    expect(buildSplit({ amount: 5000, paidBy: "maya", mode: "i-owe", people: ["maya"] }).shares).toEqual([{ personId: "me", amount: 5000 }]);
  });
  it("half: payer owes nothing, others owe an equal part, shares plus payer part = amount", () => {
    const s = buildSplit({ amount: 125000, paidBy: "me", mode: "half", people: ["maya"] });
    expect(s.shares).toEqual([{ personId: "maya", amount: 62500 }]);
    const t = buildSplit({ amount: 100, paidBy: "me", mode: "half", people: ["a", "b"] });
    expect(t.shares.map((x) => x.amount)).toEqual([33, 33]);
    const p = buildSplit({ amount: 100, paidBy: "maya", mode: "half", people: ["maya"] });
    expect(p.shares).toEqual([{ personId: "me", amount: 50 }]);
  });
  it("custom validates", () => {
    expect(() => buildSplit({ amount: 100, paidBy: "me", mode: "custom", people: [], custom: [{ personId: "a", amount: 150 }] })).toThrow();
    expect(buildSplit({ amount: 100, paidBy: "me", mode: "custom", people: [], custom: [{ personId: "a", amount: 30 }, { personId: "b", amount: 0 }] }).shares).toEqual([{ personId: "a", amount: 30 }]);
  });
  it("rejects impossible setups", () => {
    expect(() => buildSplit({ amount: 100, paidBy: "me", mode: "i-owe", people: ["a"] })).toThrow();
    expect(() => buildSplit({ amount: 100, paidBy: "a", mode: "they-owe", people: ["a"] })).toThrow();
    expect(() => buildSplit({ amount: 100, paidBy: "me", mode: "half", people: [] })).toThrow();
  });
});
