import { describe, expect, it } from "vitest";
import { parseMinor } from "../src/data/money";
import { formatMoney, reformat, unformat, type Options } from "../src/ui/moneyFormat";

const php: Options = { decimals: 2 };
const jpy: Options = { decimals: 0 };
const neg: Options = { decimals: 2, negative: true };

/** Type a string one character at a time at the end, like a user would. */
function type(s: string, o: Options = php): string {
  let shown = "";
  for (const ch of s) shown = reformat(shown + ch, shown.length + 1, o).value;
  return shown;
}

describe("grouping while typing", () => {
  it("adds commas as digits arrive", () => {
    expect(type("1")).toBe("1");
    expect(type("123")).toBe("123");
    expect(type("1234")).toBe("1,234");
    expect(type("1234567")).toBe("1,234,567");
    expect(type("1234567890")).toBe("1,234,567,890");
    expect(type("1234567.89")).toBe("1,234,567.89");
  });
  it("keeps a trailing point and the decimals as typed", () => {
    expect(type("12.")).toBe("12.");
    expect(type("1234.5")).toBe("1,234.5");
  });
  it("limits decimals to the currency", () => {
    expect(type("1.234")).toBe("1.23");
    expect(type("1234.5678")).toBe("1,234.56");
    expect(type("1250", jpy)).toBe("1,250");
    expect(type("12.50", jpy)).toBe("1,250"); // typing a point in a no-decimal currency does nothing (the display has no point to remember)
    expect(reformat("1,250.50", 8, jpy).value).toBe("1,250"); // pasted, or left over from switching currency
    expect(reformat(".5", 2, jpy).value).toBe("");
  });
  it("tidies zeros and a lone point", () => {
    expect(type("0")).toBe("0");
    expect(type("00")).toBe("0");
    expect(type("007")).toBe("7");
    expect(type("0.50")).toBe("0.50");
    expect(type(".5")).toBe("0.5");
    expect(type(".")).toBe("0.");
  });
  it("ignores junk and typed commas", () => {
    expect(type("abc12x3")).toBe("123");
    expect(type("1,2,3,4")).toBe("1,234");
    expect(type("1.2.3")).toBe("1.23");
  });
  it("allows a leading minus only when asked", () => {
    expect(type("-5000", neg)).toBe("-5,000");
    expect(type("-5000")).toBe("5,000");
    expect(type("5-000", neg)).toBe("5,000");
    expect(type("--5", neg)).toBe("-5");
    expect(type("-", neg)).toBe("-");
  });
});

describe("paste", () => {
  it("cleans symbols, commas and spaces", () => {
    expect(reformat("₱1,250.50", 9, php).value).toBe("1,250.50");
    expect(reformat("1 250", 5, php).value).toBe("1,250");
    expect(reformat("$ 12,345,678.9", 14, php).value).toBe("12,345,678.9");
  });
});

describe("caret", () => {
  it("lands after the new comma when the fourth digit is typed", () => {
    expect(reformat("1234", 4, php)).toEqual({ value: "1,234", caret: 5 });
  });
  it("stays right after a digit typed in the middle", () => {
    // "1,234" with a 9 typed after "1,2": the field now holds "1,2934", cursor after the 9
    expect(reformat("1,2934", 4, php)).toEqual({ value: "12,934", caret: 4 });
  });
  it("stays next to the surviving digits when a delete removes a comma", () => {
    // "12,345" with the 2 deleted: field holds "1,345", cursor after the 1
    expect(reformat("1,345", 1, php)).toEqual({ value: "1,345", caret: 1 });
    // "1,234" with the 1 deleted: field holds ",234", cursor at the start
    expect(reformat(",234", 0, php)).toEqual({ value: "234", caret: 0 });
  });
  it("does not move when a rejected key is typed", () => {
    expect(reformat("1,2a34", 4, php)).toEqual({ value: "1,234", caret: 3 });
  });
  it("accounts for stripped leading zeros and an inserted zero", () => {
    expect(reformat("007", 3, php)).toEqual({ value: "7", caret: 1 });
    expect(reformat(".", 1, php)).toEqual({ value: "0.", caret: 2 });
  });
  it("is clamped inside the text", () => {
    expect(reformat("12", 99, php).caret).toBe(2);
    expect(reformat("12", 0, php).caret).toBe(0);
  });
});

describe("storing the plain value", () => {
  it("unformat strips commas and always parses", () => {
    for (const s of ["1234567.89", "0.5", "7", "1250"]) {
      const shown = type(s);
      expect(parseMinor(unformat(shown))).toBe(parseMinor(s));
    }
    expect(unformat("-5,000")).toBe("-5000");
  });
  it("formats stored values for display", () => {
    expect(formatMoney("766695.75", php)).toBe("766,695.75");
    expect(formatMoney("", php)).toBe("");
    expect(formatMoney("-5000", neg)).toBe("-5,000");
    expect(formatMoney("12.50", jpy)).toBe("12");
  });
});
