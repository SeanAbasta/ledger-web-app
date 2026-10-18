import { describe, expect, it } from "vitest";
import { forecastStats } from "../src/data/summary";

const m = (month: string, end: number) => ({ month, end });

describe("forecastStats", () => {
  const months = [m("2026-10-01", 50000), m("2026-11-01", -20000), m("2026-12-01", 80000), m("2027-01-01", -20000), m("2027-02-01", 80000), m("2027-03-01", 10000)];

  it("finds the lowest and highest month, the earliest on a tie", () => {
    const s = forecastStats(100000, months);
    expect(s.lowest).toEqual({ month: "2026-11-01", amount: -20000 });
    expect(s.highest).toEqual({ month: "2026-12-01", amount: 80000 });
  });

  it("measures the change from today's balance and counts months below zero", () => {
    const s = forecastStats(100000, months);
    expect(s.change).toBe(10000 - 100000);
    expect(s.below).toBe(2);
  });

  it("follows the range shown, and counts none when all months stay above zero", () => {
    const s = forecastStats(100000, months.slice(0, 1).concat(m("2026-11-01", 60000), m("2026-12-01", 70000)));
    expect(s).toEqual({ lowest: { month: "2026-10-01", amount: 50000 }, highest: { month: "2026-12-01", amount: 70000 }, change: -30000, below: 0 });
  });

  it("a month that ends at exactly zero is not below zero", () => {
    expect(forecastStats(0, [m("2026-10-01", 0), m("2026-11-01", -1)]).below).toBe(1);
  });

  it("with no months there is no lowest or highest and no change", () => {
    expect(forecastStats(100000, [])).toEqual({ lowest: undefined, highest: undefined, change: 0, below: 0 });
  });
});
