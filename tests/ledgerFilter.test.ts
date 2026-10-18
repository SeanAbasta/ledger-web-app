import { describe, expect, it } from "vitest";
import { categoryChoices, categoryOf, itemMatches } from "../src/data/ledgerFilter";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";

const t = "2026-10-01T00:00:00Z";
const entry = (id: string, date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date, amount, currency: "PHP", createdAt: t, updatedAt: t, ...extra });

const entries: Entry[] = [
  entry("e1", "2026-10-02", 50000, { category: "Food", note: "Taxi home" }),
  entry("e2", "2026-10-03", 120000, { category: "Transport", note: "Taxi" }),
  entry("e3", "2026-10-04", 30000, { note: "Laptop stand" }), // no category
  entry("e4", "2026-10-05", 10000, { category: "Gadgets" }), // a category removed from Settings
  entry("e5", "2026-10-06", 200000, { kind: "transfer", category: "Card payment", accountId: "A1", toAccountId: "C1" }),
  entry("e6", "2026-10-07", 40000, { kind: "settlement", category: "Settlement", personId: "P1", direction: "in" }),
];
const plan: Rule = { id: "r1", type: "recurring", kind: "expense", amount: 99900, currency: "PHP", category: "Bills", note: "Internet", frequency: "monthly", start: "2026-09-10", updatedAt: t,
  revisions: [{ from: "2026-10-10", category: "Fun" }] };
const items = ledgerItems(entries, [plan], "2026-10-01", "2026-10-31");
const ids = (q: string, cat: string) => items.filter((it) => itemMatches(it, q, cat)).map((it) => (it.type === "entry" ? it.entry.id : it.occ.ruleId)).sort();

describe("Ledger filter", () => {
  it("no filter keeps everything", () => {
    expect(ids("", "")).toHaveLength(items.length);
    expect(ids("  ", "")).toHaveLength(items.length);
  });

  it("search alone matches category, note, amount and currency", () => {
    expect(ids("taxi", "")).toEqual(["e1", "e2"]);
    expect(ids("1,200", "")).toEqual(["e2"]);
  });

  it("category alone, and category with search (both must match)", () => {
    expect(ids("", "Transport")).toEqual(["e2"]);
    expect(ids("taxi", "Food")).toEqual(["e1"]);
    expect(ids("laptop", "Food")).toEqual([]);
  });

  it("an item with no category is Other", () => {
    expect(ids("", "Other")).toEqual(["e3"]);
    expect(categoryOf(items.find((it) => it.type === "entry" && it.entry.id === "e3")!)).toBe("Other");
  });

  it("a plan's payment matches its category after a revision", () => {
    expect(ids("", "Fun")).toEqual(["r1"]);
    expect(ids("", "Bills")).toEqual([]);
  });
});

describe("category choices", () => {
  const settings = ["Food", "Transport", "Bills", "Fun"];

  it("lists Settings in order, then the others in view A to Z, Other included", () => {
    expect(categoryChoices(items, settings)).toEqual(["Food", "Transport", "Bills", "Fun", "Card payment", "Gadgets", "Other", "Settlement"]);
  });

  it("does not repeat Other when Settings has it, and adds nothing when nothing is uncategorised", () => {
    expect(categoryChoices(items, [...settings, "Other"]).filter((c) => c === "Other")).toHaveLength(1);
    expect(categoryChoices([], settings)).toEqual(settings);
  });

  it("keeps the selected category when the period has none of it", () => {
    expect(categoryChoices([], settings, "Gadgets")).toEqual([...settings, "Gadgets"]);
  });
});
