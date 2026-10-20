import { describe, expect, it } from "vitest";
import { SIDE_INCOME } from "../src/data/sideIncome";
import { categoryChips } from "../src/ui/categoryChipList";

const SETTINGS = ["Food", "Transport", "Rent", "Bills"];

describe("categoryChips", () => {
  it("keeps the list's order", () => {
    expect(categoryChips(SETTINGS, "Rent")).toEqual(SETTINGS);
  });
  it("adds the current category at the end when the list lacks it", () => {
    expect(categoryChips(SETTINGS, "Salary")).toEqual([...SETTINGS, "Salary"]);
  });
  it("never lists the current category twice", () => {
    expect(categoryChips(SETTINGS, "Food").filter((c) => c === "Food")).toHaveLength(1);
  });
  it("matches exactly, like the old select", () => {
    expect(categoryChips(SETTINGS, "food")).toEqual([...SETTINGS, "food"]);
  });
  it("adds nothing for an empty current category", () => {
    expect(categoryChips(SETTINGS, "")).toEqual(SETTINGS);
  });
  it("passes the fixed income list through", () => {
    expect(categoryChips(SIDE_INCOME, "Gift")).toEqual([...SIDE_INCOME]);
  });
  it("does not change the list it was given", () => {
    const list = [...SETTINGS];
    categoryChips(list, "Salary");
    expect(list).toEqual(SETTINGS);
  });
});
