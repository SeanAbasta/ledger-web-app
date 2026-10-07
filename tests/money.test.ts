import { describe, expect, it } from "vitest";
import { convertMinor, formatMinor, parseMinor, splitEvenly } from "../src/data/money";

describe("money", () => {
  it("parses input into minor units", () => {
    expect(parseMinor("1,250.5")).toBe(125050);
    expect(parseMinor("0.07")).toBe(7);
    expect(parseMinor("12")).toBe(1200);
    expect(parseMinor("1250", "JPY")).toBe(1250);
  });
  it("rejects bad input", () => {
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("abc")).toBeNull();
    expect(parseMinor("1.234")).toBeNull();
    expect(parseMinor("-5")).toBeNull();
    expect(parseMinor("1.5", "JPY")).toBeNull();
  });
  it("has no float drift", () => {
    expect(parseMinor("0.1")! + parseMinor("0.2")!).toBe(30);
  });
  it("formats", () => {
    expect(formatMinor(125050)).toBe("₱1,250.50");
    expect(formatMinor(-7)).toBe("-₱0.07");
    expect(formatMinor(1250, "JPY")).toBe("¥1,250");
    expect(formatMinor(21000, "USD")).toBe("$210.00");
  });
  it("converts with a decimal rate", () => {
    expect(convertMinor(10000, "56.25", "USD", "PHP")).toBe(562500); // $100 -> ₱5,625.00
    expect(convertMinor(1, "56.25", "USD", "PHP")).toBe(56); // 56.25 centavos rounds to 56
    expect(convertMinor(1000, "0.38", "PHP", "JPY")).toBe(4); // ₱10.00 -> ¥3.8 -> 4
  });
  it("splits evenly and exactly", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(125000, 2)).toEqual([62500, 62500]);
    expect(splitEvenly(101, 2).reduce((a, b) => a + b, 0)).toBe(101);
  });
});
