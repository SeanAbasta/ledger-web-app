import { describe, expect, it } from "vitest";
import { SIDE_INCOME } from "../src/data/sideIncome";
import { categoryChips, visibleChips } from "../src/ui/categoryChipList";

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

describe("visibleChips: the picked chip and three more, then More", () => {
  const LONG = ["Food", "Transport", "Rent", "Bills", "Shopping", "Health", "Fun", "Other"];
  it("shows the first four in Settings order when the picked one is among them", () => {
    expect(visibleChips(LONG, "Transport")).toEqual({ shown: ["Food", "Transport", "Rent", "Bills"], more: 4 });
  });
  it("keeps the picked one in view when it is further down, without moving the others", () => {
    expect(visibleChips(LONG, "Fun")).toEqual({ shown: ["Food", "Transport", "Rent", "Fun"], more: 4 });
  });
  it("a category the list lacks (a salary entry) is the one kept in view", () => {
    expect(visibleChips(LONG, "Salary")).toEqual({ shown: ["Food", "Transport", "Rent", "Salary"], more: 5 });
  });
  it("no More chip for a short list, or when it would hide only one", () => {
    expect(visibleChips(SETTINGS, "Rent")).toEqual({ shown: SETTINGS, more: 0 });
    expect(visibleChips([...SETTINGS, "Fun"], "Rent")).toEqual({ shown: [...SETTINGS, "Fun"], more: 0 });
  });
  it("nothing picked: the first four", () => {
    expect(visibleChips(LONG, "")).toEqual({ shown: LONG.slice(0, 4), more: 4 });
  });
});
