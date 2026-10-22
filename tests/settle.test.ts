import { describe, expect, it } from "vitest";
import { partCheck } from "../src/features/splits/settle";

describe("partCheck: Part of it, capped at the balance", () => {
  it("a part payment leaves the rest owed", () => {
    expect(partCheck(900000, 500000, "PHP", "Alex")).toEqual({ remaining: 400000, line: "Alex will still owe you ₱4,000.00" });
  });
  it("an exact payment settles it", () => {
    expect(partCheck(900000, 900000, "PHP", "Alex")).toEqual({ remaining: 0, line: "That settles it." });
  });
  it("an over payment is refused with the limit stated", () => {
    expect(partCheck(900000, 900001, "PHP", "Alex")).toEqual({ error: "That is more than Alex owes. The most you can record is ₱9,000.00." });
  });
  it("works the other way: what I owe", () => {
    expect(partCheck(-300000, 100000, "PHP", "Alex")).toEqual({ remaining: 200000, line: "You will still owe Alex ₱2,000.00" });
    expect(partCheck(-300000, 400000, "PHP", "Alex")).toEqual({ error: "That is more than you owe Alex. The most you can record is ₱3,000.00." });
  });
  it("needs an amount", () => {
    expect(partCheck(900000, null, "PHP", "Alex")).toEqual({ error: "Enter an amount" });
    expect(partCheck(900000, 0, "PHP", "Alex")).toEqual({ error: "Enter an amount" });
  });
});
