import { describe, expect, it } from "vitest";
import type { Line } from "../src/data/balances";
import { isSettled, splitSettled } from "../src/features/splits/settledGroups";

const line = (id: string, amount: number, currency = "PHP"): Line => ({ id, date: "2026-10-01", label: id, amount, currency });
const row = (name: string, lines: Line[]) => ({ name, lines });

describe("settledGroups: People with a balance and the settled ones", () => {
  it("a person whose lines add up to zero is settled", () => {
    expect(isSettled([line("a", 60000), line("b", -60000)])).toBe(true);
    expect(isSettled([line("a", 60000)])).toBe(false);
  });
  it("zero in one currency is not settled while another is open", () => {
    expect(isSettled([line("a", 100, "USD"), line("b", -100, "USD"), line("c", 500, "PHP")])).toBe(false);
  });
  it("keeps each group in its order", () => {
    const rows = [row("A", [line("a", 1)]), row("B", [line("b", 1), line("c", -1)]), row("C", [line("d", 5)]), row("D", [line("e", 2), line("f", -2)])];
    const g = splitSettled(rows);
    expect(g.open.map((r) => r.name)).toEqual(["A", "C"]);
    expect(g.settled.map((r) => r.name)).toEqual(["B", "D"]);
  });
});
