import { describe, expect, it } from "vitest";
import { TONES, categoryTone } from "../src/ui/categoryColor";

describe("category colours", () => {
  it("gives common categories their set colour, ignoring case and spaces", () => {
    expect(categoryTone("Food")).toBe("orange");
    expect(categoryTone(" food ")).toBe("orange");
    expect(categoryTone("Transport")).toBe("blue");
    expect(categoryTone("Shopping")).toBe("purple");
    expect(categoryTone("Bills")).toBe("teal");
    expect(categoryTone("Card payment")).toBe("gray");
  });
  it("keeps grey for Other, money moves and a missing category", () => {
    for (const c of ["Other", "Others", "Settlement", "", undefined]) expect(categoryTone(c)).toBe("gray");
  });
  it("gives any other name the same colour every time, never grey", () => {
    for (const c of ["Pets", "Baby", "Car", "Insurance", "Kids", "Donations", "Hobbies", "Ψ"]) {
      const t = categoryTone(c);
      expect(TONES).toContain(t);
      expect(t).not.toBe("gray");
      expect(categoryTone(c)).toBe(t);
      expect(categoryTone(c.toUpperCase())).toBe(t);
    }
  });
});
