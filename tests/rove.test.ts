import { describe, expect, it } from "vitest";
import { roveTo } from "../src/features/dashboard/rove";

// A 30 day month. Days 0 to 9 have happened, 15 and 20 have something planned, the rest are plain.
const ok = (i: number) => i < 10 || i === 15 || i === 20;

describe("roveTo: arrow keys in the Daily calendar", () => {
  it("Left and Right go to the next day that is a button, skipping the plain future days", () => {
    expect(roveTo("ArrowRight", 3, 30, ok)).toBe(4);
    expect(roveTo("ArrowLeft", 3, 30, ok)).toBe(2);
    expect(roveTo("ArrowRight", 9, 30, ok)).toBe(15);
    expect(roveTo("ArrowLeft", 15, 30, ok)).toBe(9);
  });
  it("stays put at the ends", () => {
    expect(roveTo("ArrowLeft", 0, 30, ok)).toBeUndefined();
    expect(roveTo("ArrowRight", 20, 30, ok)).toBeUndefined();
  });
  it("Up and Down keep the weekday and look a week at a time", () => {
    expect(roveTo("ArrowDown", 3, 30, ok)).toBeUndefined(); // day 10 is not a button, nor is 17, 24
    expect(roveTo("ArrowDown", 1, 30, ok)).toBe(8);
    expect(roveTo("ArrowUp", 8, 30, ok)).toBe(1);
    expect(roveTo("ArrowDown", 8, 30, (i) => i === 8 || i === 22)).toBe(22);
  });
  it("Home and End go to the first and last button", () => {
    expect(roveTo("Home", 5, 30, ok)).toBe(0);
    expect(roveTo("End", 5, 30, ok)).toBe(20);
    expect(roveTo("Home", 0, 30, ok)).toBeUndefined();
  });
  it("ignores other keys", () => {
    expect(roveTo("a", 3, 30, ok)).toBeUndefined();
    expect(roveTo("Tab", 3, 30, ok)).toBeUndefined();
  });
});
