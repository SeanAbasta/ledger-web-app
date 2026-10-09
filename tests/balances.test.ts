import { describe, expect, it } from "vitest";
import { nonZero, owedSummary, personLines, statementOf, sumBy } from "../src/data/balances";
import type { LedgerItem } from "../src/data/rules";
import type { Entry } from "../src/data/schema";

const it_ = (e: Partial<Entry> & { id: string; date: string; amount: number }): LedgerItem => ({
  type: "entry", date: e.date,
  entry: { kind: "expense", currency: "PHP", category: "Food", createdAt: "x", updatedAt: "x", ...e } as Entry,
});
const meHalf = (id: string, date: string, amount: number, p = "maya") =>
  it_({ id, date, amount, split: { paidBy: "me", mode: "half", shares: [{ personId: p, amount: amount / 2 }] } });
const theyPaid = (id: string, date: string, amount: number) =>
  it_({ id, date, amount, split: { paidBy: "maya", mode: "half", shares: [{ personId: "me", amount: amount / 2 }] } });
const settle = (id: string, date: string, amount: number, direction: "in" | "out") =>
  it_({ id, date, amount, kind: "settlement", personId: "maya", direction });

describe("balances", () => {
  it("they owe me when I paid, I owe them when they paid", () => {
    const lines = personLines("maya", [meHalf("a", "2026-10-01", 1000), theyPaid("b", "2026-10-02", 300)]);
    expect(lines.map((l) => l.amount)).toEqual([500, -150]);
    expect(sumBy(lines)).toEqual({ PHP: 350 });
  });
  it("ignores other people and non-split entries", () => {
    const lines = personLines("maya", [meHalf("a", "2026-10-01", 1000, "jon"), it_({ id: "c", date: "2026-10-01", amount: 99 })]);
    expect(lines).toEqual([]);
  });
  it("settlements move the balance toward zero in both directions", () => {
    const base = [meHalf("a", "2026-10-01", 1000)];
    expect(sumBy(personLines("maya", [...base, settle("s", "2026-10-03", 500, "in")]))).toEqual({ PHP: 0 });
    expect(sumBy(personLines("maya", [...base, theyPaid("b", "2026-10-02", 2000), settle("s", "2026-10-03", 500, "out")]))).toEqual({ PHP: 0 });
  });
  it("ignores settlements with another person", () => {
    const s = it_({ id: "s", date: "2026-10-03", amount: 500, kind: "settlement", personId: "jon", direction: "in" });
    expect(personLines("maya", [s])).toEqual([]);
  });
  it("keeps currencies separate", () => {
    const usd = it_({ id: "u", date: "2026-10-02", amount: 1000, currency: "USD", split: { paidBy: "me", mode: "half", shares: [{ personId: "maya", amount: 500 }] } });
    expect(sumBy(personLines("maya", [meHalf("a", "2026-10-01", 1000), usd]))).toEqual({ PHP: 500, USD: 500 });
  });
  it("statement rolls everything before the last settlement into a carried balance", () => {
    const lines = personLines("maya", [
      meHalf("a", "2026-09-01", 1000), settle("s", "2026-09-10", 200, "in"), meHalf("b", "2026-10-01", 400), meHalf("c", "2026-10-05", 600),
    ]);
    const st = statementOf(lines);
    expect(st.earlier).toEqual({ PHP: 300 });
    expect(st.lines.map((l) => l.id)).toEqual(["b", "c"]);
    expect(st.net).toEqual({ PHP: 800 });
    expect(st.earlier.PHP! + sumBy(st.lines).PHP!).toBe(st.net.PHP);
  });
  it("a settlement on the same day as an expense comes after it", () => {
    const st = statementOf(personLines("maya", [settle("0001", "2026-10-07", 500, "in"), meHalf("zzz", "2026-10-07", 1000)]));
    expect(st.lines).toEqual([]);
    expect(st.earlier).toEqual({ PHP: 0 });
  });
  it("hides exactly-settled currencies", () => {
    expect(nonZero({ PHP: 0, USD: 5 })).toEqual([["USD", 5]]);
  });
});

describe("owedSummary", () => {
  const people = [{ id: "maya", name: "Maya", updatedAt: "x" }, { id: "jon", name: "Jon", updatedAt: "x" }, { id: "ana", name: "Ana", updatedAt: "x" }];
  const theyOwe = (id: string, date: string, amount: number, p: string, extra: Partial<Entry> = {}) =>
    it_({ id, date, amount, split: { paidBy: "me", mode: "they-owe", shares: [{ personId: p, amount }] }, ...extra });
  const iOwe = (id: string, date: string, amount: number, p: string) =>
    it_({ id, date, amount, split: { paidBy: p, mode: "i-owe", shares: [{ personId: "me", amount }] } });

  it("totals per person and overall, largest first, owed to me minus what I owe", () => {
    const s = owedSummary(people, [theyOwe("a", "2026-10-01", 300, "jon"), theyOwe("b", "2026-10-02", 850, "maya"), iOwe("c", "2026-10-03", 48, "ana")], "PHP");
    expect(s.people.map((p) => [p.person.name, p.base])).toEqual([["Maya", 850], ["Jon", 300], ["Ana", -48]]);
    expect([s.owedToMe, s.iOwe, s.net, s.skipped]).toEqual([1150, 48, 1102, 0]);
  });
  it("leaves out people who are settled and counts settlements", () => {
    const s = owedSummary(people, [theyOwe("a", "2026-10-01", 300, "jon"), it_({ id: "t", date: "2026-10-03", amount: 300, kind: "settlement", personId: "jon", direction: "in" })], "PHP");
    expect(s.people).toEqual([]);
    expect(s.net).toBe(0);
  });
  it("converts foreign balances with the latest rate, and skips them without one", () => {
    const usd = theyOwe("u", "2026-10-01", 1000, "maya", { currency: "USD", rate: "56" });
    const s = owedSummary(people, [usd, theyOwe("e", "2026-10-02", 2000, "jon", { currency: "EUR" })], "PHP");
    expect(s.people.find((p) => p.person.id === "maya")).toMatchObject({ base: 56000, foreign: true, byCurrency: { USD: 1000 } });
    expect(s.people.find((p) => p.person.id === "jon")).toMatchObject({ base: 0, byCurrency: { EUR: 2000 } });
    expect(s.skipped).toBe(1);
    expect(s.net).toBe(56000);
  });
  it("a foreign balance that is fully settled counts as zero even without a rate on the payment", () => {
    const usd = theyOwe("u", "2026-10-01", 1000, "maya", { currency: "USD", rate: "56" });
    const paid = it_({ id: "p", date: "2026-10-05", amount: 1000, currency: "USD", kind: "settlement", personId: "maya", direction: "in" });
    expect(owedSummary(people, [usd, paid], "PHP")).toMatchObject({ people: [], net: 0, skipped: 0 });
  });
});
