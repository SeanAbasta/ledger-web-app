import { describe, expect, it } from "vitest";
import { addDays, addMonths, contains, labelDay, monthKeysBetween, periodOf, weekStart } from "../src/data/dates";
import { applyRevision, baseFor, ledgerItems, occurrences } from "../src/data/rules";
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
  it("gives the Day, Week and Month periods around an anchor", () => {
    expect(periodOf("Day", "2026-10-10")).toEqual(["2026-10-10", "2026-10-10"]);
    expect(periodOf("Week", "2026-10-10")).toEqual(["2026-10-05", "2026-10-11"]);
    expect(periodOf("Week", "2026-09-30")).toEqual(["2026-09-28", "2026-10-04"]);
    expect(periodOf("Month", "2028-02-14")).toEqual(["2028-02-01", "2028-02-29"]);
  });
  it("knows which periods hold today (Next 30 days only shows there)", () => {
    const t = "2026-10-10";
    expect(contains(periodOf("Month", "2026-10-01"), t)).toBe(true);
    expect(contains(periodOf("Week", "2026-10-05"), t)).toBe(true);
    expect(contains(periodOf("Week", "2026-10-11"), t)).toBe(true);
    expect(contains(periodOf("Day", t), t)).toBe(true);
    expect(contains(periodOf("Month", "2026-11-01"), t)).toBe(false);
    expect(contains(periodOf("Month", "2026-09-30"), t)).toBe(false);
    expect(contains(periodOf("Week", "2026-10-12"), t)).toBe(false);
    expect(contains(periodOf("Day", "2026-10-09"), t)).toBe(false);
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

describe("revisions (edit this and later)", () => {
  const sub = (r: Partial<Rule> = {}) => rule({ start: "2026-01-31", amount: 50000, note: "Streaming", category: "Bills", ...r });
  const amounts = (r: Rule, from = "2026-01-01", to = "2026-06-30") => occurrences(r, from, to).map((o) => [o.date, o.amount]);

  it("changes the price from a date onward and leaves earlier payments alone", () => {
    const r = applyRevision(sub(), "2026-03-31", { amount: 65000 });
    expect(amounts(r)).toEqual([["2026-01-31", 50000], ["2026-02-28", 50000], ["2026-03-31", 65000], ["2026-04-30", 65000], ["2026-05-31", 65000], ["2026-06-30", 65000]]);
  });
  it("keeps the anchor day, so a rule on the 31st still lands on the 31st after a revision", () => {
    const r = applyRevision(sub(), "2026-02-28", { amount: 1 });
    expect(occurrences(r, "2026-03-01", "2026-03-31").map((o) => o.date)).toEqual(["2026-03-31"]);
  });
  it("a later edit replaces an earlier one and drops later revisions and overrides", () => {
    let r = applyRevision(sub(), "2026-02-28", { amount: 60000 });
    r = applyRevision(r, "2026-05-31", { amount: 70000 });
    r = { ...r, overrides: { ...r.overrides, "2026-06-30": { amount: 1 } } };
    r = applyRevision(r, "2026-03-31", { amount: 55000 });
    expect(amounts(r)).toEqual([["2026-01-31", 50000], ["2026-02-28", 60000], ["2026-03-31", 55000], ["2026-04-30", 55000], ["2026-05-31", 55000], ["2026-06-30", 55000]]);
  });
  it("editing the same date again replaces that revision", () => {
    const r = applyRevision(applyRevision(sub(), "2026-03-31", { amount: 60000 }), "2026-03-31", { amount: 62000 });
    expect(r.revisions).toHaveLength(1);
    expect(amounts(r, "2026-03-01", "2026-03-31")).toEqual([["2026-03-31", 62000]]);
  });
  it("changes note, category and account too, and a per-date override still wins", () => {
    let r = applyRevision(sub({ accountId: "A" }), "2026-03-31", { amount: 65000, note: "Streaming plus", category: "Fun", accountId: "B" });
    r = { ...r, overrides: { "2026-04-30": { amount: 100 } } };
    const o = occurrences(r, "2026-02-01", "2026-05-31");
    expect(o.map((x) => [x.amount, x.note, x.category, x.accountId])).toEqual([
      [50000, "Streaming", "Bills", "A"], [65000, "Streaming plus", "Fun", "B"], [100, "Streaming plus", "Fun", "B"], [65000, "Streaming plus", "Fun", "B"],
    ]);
  });
  it("installments ignore revisions", () => {
    const r = applyRevision(rule({ type: "installment", total: 9000, count: 3, amount: 3000, start: "2026-10-15" }), "2026-11-15", { amount: 999 });
    expect(occurrences(r, "2026-01-01", "2030-01-01").map((o) => o.amount)).toEqual([3000, 3000, 3000]);
  });
  it("baseFor reports the effective payment before overrides", () => {
    const r = applyRevision(sub(), "2026-03-31", { amount: 65000 });
    expect(baseFor(r, "2026-02-28").amount).toBe(50000);
    expect(baseFor(r, "2026-04-30")).toMatchObject({ amount: 65000, note: "Streaming", category: "Bills" });
  });
});

describe("newest first ordering", () => {
  const ent = (id: string, date: string, createdAt: string, extra: Partial<Entry> = {}): Entry => ({
    id, kind: "expense", date, amount: 100, currency: "PHP", createdAt, updatedAt: createdAt, ...extra,
  });
  const order = (items: ReturnType<typeof ledgerItems>) => items.map((i) => (i.type === "entry" ? i.entry.id : `occ:${i.occ.ruleId}`));

  it("puts the most recently added entry first inside a day, whatever the file order", () => {
    const entries = [ent("A", "2026-10-09", "2026-10-09T01:00:00Z"), ent("B", "2026-10-09", "2026-10-09T05:00:00Z"), ent("C", "2026-10-09", "2026-10-09T03:00:00Z")];
    expect(order(ledgerItems(entries, [], "2026-10-01", "2026-10-31"))).toEqual(["B", "C", "A"]);
  });
  it("puts generated payments at the start of their day, below that day's entries", () => {
    const entries = [ent("A", "2026-10-09", "2026-10-09T01:00:00Z"), ent("B", "2026-10-09", "2026-10-09T05:00:00Z")];
    const sub = rule({ id: "SUB", start: "2026-10-09", amount: 28500 });
    expect(order(ledgerItems(entries, [sub], "2026-10-09", "2026-10-09"))).toEqual(["B", "A", "occ:SUB"]);
  });
  it("keeps days newest first, and an entry backdated today sorts by its date, not when it was added", () => {
    const entries = [ent("OLD", "2026-10-07", "2026-10-09T09:00:00Z"), ent("NEW", "2026-10-09", "2026-10-09T01:00:00Z"), ent("MID", "2026-10-08", "2026-10-08T01:00:00Z")];
    const sub = rule({ id: "SUB", start: "2026-10-08", amount: 1 });
    expect(order(ledgerItems(entries, [sub], "2026-10-07", "2026-10-09"))).toEqual(["NEW", "MID", "occ:SUB", "OLD"]);
  });
  it("an edit (new updatedAt, same createdAt) keeps its place", () => {
    const a = ent("A", "2026-10-09", "2026-10-09T01:00:00Z");
    const b = ent("B", "2026-10-09", "2026-10-09T05:00:00Z");
    const edited = { ...a, amount: 999, updatedAt: "2026-10-10T00:00:00Z" };
    expect(order(ledgerItems([edited, b], [], "2026-10-09", "2026-10-09"))).toEqual(["B", "A"]);
  });
});
