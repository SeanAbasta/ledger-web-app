import { describe, expect, it } from "vitest";
import { itemMatches } from "../src/data/ledgerFilter";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { allTimeRange, emptyAction, groupByDay, groupByMonth } from "../src/features/ledger/allTime";

const T = "2026-10-20";
const U = "2026-10-01T00:00:00Z";
const entry = (id: string, date: string, note: string, category = "Transport", extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date, amount: 30000, currency: "PHP", category, note, createdAt: `${date}T08:00:00Z`, updatedAt: U, ...extra });
const plan = (id: string, start: string, extra: Partial<Rule> = {}): Rule => ({ id, type: "recurring", kind: "expense", amount: 100000, currency: "PHP", category: "Bills", note: "Phone plan", frequency: "monthly", start, updatedAt: U, ...extra });

const entries = [
  entry("e1", "2026-08-14", "Taxi"),
  entry("e2", "2026-09-09", "Taxi"),
  entry("e3", "2026-10-18", "Taxi"),
  entry("e4", "2026-10-20", "Coffee", "Food"),
  entry("e5", "2026-10-19", "Taxi home"),
  entry("e6", "2026-10-19", "Dinner", "Food", { createdAt: "2026-10-19T20:00:00Z" }),
  entry("gone", "2026-07-01", "Taxi", "Transport", { deleted: true }),
];
const rules = [plan("r1", "2026-08-25")];

describe("allTimeRange", () => {
  it("runs from the first entry or plan start to 30 days from today", () => {
    expect(allTimeRange(entries, rules, T)).toEqual(["2026-08-14", "2026-11-19"]);
    expect(allTimeRange(entries, [plan("r0", "2026-06-01")], T)).toEqual(["2026-06-01", "2026-11-19"]);
  });
  it("reaches a later-dated entry", () => {
    expect(allTimeRange([...entries, entry("far", "2027-02-01", "Flight")], rules, T)).toEqual(["2026-08-14", "2027-02-01"]);
  });
  it("ignores deleted entries and is undefined with nothing", () => {
    expect(allTimeRange(entries, rules, T)?.[0]).toBe("2026-08-14");
    expect(allTimeRange([], [], T)).toBeUndefined();
  });
});

describe("grouping", () => {
  it("groupByDay keeps the Ledger's order inside a period", () => {
    const items = ledgerItems(entries, rules, "2026-10-01", "2026-10-31");
    const groups = groupByDay(items);
    expect(groups.map(([d]) => d)).toEqual(["2026-10-25", "2026-10-20", "2026-10-19", "2026-10-18"]);
    expect(groups.flatMap(([, its]) => its)).toEqual(items);
    expect(groups[2]![1].map((it) => (it.type === "entry" ? it.entry.note : "")).join(",")).toBe("Dinner,Taxi home");
  });
  it("groupByMonth heads each month, newest first", () => {
    const [from, to] = allTimeRange(entries, rules, T)!;
    const months = groupByMonth(ledgerItems(entries, rules, from, to));
    expect(months.map(([m]) => m)).toEqual(["2026-10", "2026-09", "2026-08"]); // the Nov 25 payment is past the horizon (Nov 19)
    expect(months[0]![1].map(([d]) => d)).toEqual(["2026-10-25", "2026-10-20", "2026-10-19", "2026-10-18"]);
  });
});

describe("searching all months", () => {
  const all = () => { const [from, to] = allTimeRange(entries, rules, T)!; return ledgerItems(entries, rules, from, to); };
  it("finds matches across three months with the same itemMatches", () => {
    const hits = all().filter((it) => itemMatches(it, "taxi", ""));
    expect(hits.map((it) => it.date)).toEqual(["2026-10-19", "2026-10-18", "2026-09-09", "2026-08-14"]);
    expect(groupByMonth(hits).map(([m]) => m)).toEqual(["2026-10", "2026-09", "2026-08"]);
  });
  it("includes plan payments up to the horizon, and a plan with no end stops there", () => {
    const hits = all().filter((it) => itemMatches(it, "phone", ""));
    expect(hits.map((it) => it.date)).toEqual(["2026-10-25", "2026-09-25", "2026-08-25"]);
    expect(hits.every((it) => it.date <= "2026-11-19")).toBe(true);
  });
  it("works with a category alone", () => {
    expect(all().filter((it) => itemMatches(it, "", "Food")).map((it) => it.date)).toEqual(["2026-10-20", "2026-10-19"]);
  });
});

describe("emptyAction", () => {
  it("offers Search all months when filtered, on any period", () => {
    expect(emptyAction(["2026-10-01", "2026-10-31"], T, true)).toBe("search");
    expect(emptyAction(["2026-08-01", "2026-08-31"], T, true)).toBe("search");
  });
  it("offers Add expense on an empty period that holds today", () => {
    expect(emptyAction(["2026-10-01", "2026-10-31"], T, false)).toBe("add");
    expect(emptyAction([T, T], T, false)).toBe("add");
  });
  it("offers nothing on past and future periods", () => {
    expect(emptyAction(["2026-11-01", "2026-11-30"], T, false)).toBeUndefined();
    expect(emptyAction(["2026-09-01", "2026-09-30"], T, false)).toBeUndefined();
  });
});
