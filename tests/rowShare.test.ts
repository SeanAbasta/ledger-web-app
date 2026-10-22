import { describe, expect, it } from "vitest";
import { buildSplit } from "../src/data/splits";
import { ledgerItems, type LedgerItem } from "../src/data/rules";
import type { Entry, Rule, Split } from "../src/data/schema";
import { summarize } from "../src/data/summary";
import { dayShare, shareLine } from "../src/features/ledger/rowShare";

const entry = (amount: number, split?: Split, currency = "PHP"): LedgerItem => {
  const e: Entry = { id: "E1", kind: "expense", date: "2026-10-15", amount, currency, category: "Food", note: "Dinner", split, createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z" };
  return { type: "entry", date: e.date, entry: e };
};

describe("shareLine", () => {
  it("Even with two people: half", () => {
    expect(shareLine(entry(300000, buildSplit({ amount: 300000, paidBy: "me", mode: "half", people: ["alex"] })))).toBe("yours ₱1,500.00");
  });
  it("Even with three: a third, with the centavos as stored", () => {
    const split = buildSplit({ amount: 10000, paidBy: "me", mode: "half", people: ["alex", "sam"] });
    expect(shareLine(entry(10000, split))).toBe("yours ₱33.34");
  });
  it("They owe: nothing", () => {
    expect(shareLine(entry(300000, buildSplit({ amount: 300000, paidBy: "me", mode: "they-owe", people: ["alex"] })))).toBe("yours ₱0.00");
  });
  it("I owe all: the full amount", () => {
    expect(shareLine(entry(200000, buildSplit({ amount: 200000, paidBy: "alex", mode: "i-owe", people: ["alex"] })))).toBe("yours ₱2,000.00");
  });
  it("a plan payment uses its own split", () => {
    const rule: Rule = { id: "R1", type: "recurring", kind: "expense", amount: 100000, currency: "PHP", category: "Bills", note: "Phone plan", frequency: "monthly", start: "2026-10-05", split: buildSplit({ amount: 100000, paidBy: "me", mode: "half", people: ["alex"] }), updatedAt: "2026-10-01T00:00:00Z" };
    const [occ] = ledgerItems([], [rule], "2026-10-01", "2026-10-31");
    expect(occ?.type).toBe("occurrence");
    expect(shareLine(occ!)).toBe("yours ₱500.00");
  });
  it("is undefined when not split", () => {
    expect(shareLine(entry(25000))).toBeUndefined();
  });
  it("keeps a foreign amount in its own currency", () => {
    expect(shareLine(entry(12000, buildSplit({ amount: 12000, paidBy: "me", mode: "half", people: ["alex", "sam"] }), "USD"))).toBe("yours $40.00");
  });
});

describe("dayShare: the day head's yours figure", () => {
  const e = (id: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date: "2026-10-15", amount, currency: "PHP", category: "Food", note: "Dinner", createdAt: "2026-10-15T00:00:00Z", updatedAt: "2026-10-15T00:00:00Z", ...extra });
  const items = (es: Entry[]): LedgerItem[] => es.map((x) => ({ type: "entry", date: x.date, entry: x }));
  it("a split and a plain expense: half of one plus all of the other", () => {
    const es = [e("A", 300000, { split: buildSplit({ amount: 300000, paidBy: "me", mode: "half", people: ["alex"] }) }), e("B", 25000)];
    expect(dayShare(items(es), "PHP", es)).toBe(150000 + 25000);
  });
  it("equals the Dashboard's figure for that day", () => {
    const es = [e("A", 300000, { split: buildSplit({ amount: 300000, paidBy: "me", mode: "half", people: ["alex"] }) }), e("B", 40000, { split: buildSplit({ amount: 40000, paidBy: "alex", mode: "i-owe", people: ["alex"] }) }), e("C", 9000)];
    const s = summarize(items(es), "PHP", "2026-10-15", "2026-10-15", es);
    expect(dayShare(items(es), "PHP", es)).toBe(s.byDay[0]);
  });
  it("a refund of a split purchase comes off at my share", () => {
    const buy = e("A", 200000, { date: "2026-10-01", split: buildSplit({ amount: 200000, paidBy: "me", mode: "half", people: ["alex"] }) });
    const back = e("R", 100000, { kind: "income", refund: true, refundOf: "A", category: "Food" });
    expect(dayShare(items([back]), "PHP", [buy, back])).toBe(-50000);
  });
  it("income, transfers and settlements are not spending", () => {
    const es = [e("I", 500000, { kind: "income", category: "Sale" }), e("T", 100000, { kind: "transfer", category: "Transfer" }), e("S", 30000, { kind: "settlement", category: "Settlement" })];
    expect(dayShare(items(es), "PHP", es)).toBe(0);
  });
});
