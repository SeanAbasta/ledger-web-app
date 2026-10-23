import { describe, expect, it } from "vitest";
import { occurrences } from "../src/data/rules";
import type { Rule } from "../src/data/schema";
import { cardVisible } from "../src/features/ledger/nextCard";

const U = "2026-10-01T00:00:00Z";
const phone: Rule = { id: "P", type: "recurring", kind: "expense", amount: 100000, currency: "PHP", category: "Bills", note: "Phone plan", frequency: "monthly", start: "2026-08-25", updatedAt: U };
const due = occurrences(phone, "2026-10-21", "2026-11-19");

describe("the Coming up pointer in the Ledger", () => {
  it("shows on the period that holds today, when something is due", () => {
    expect(due.length).toBeGreaterThan(0);
    expect(cardVisible(true, due, false)).toBe(true);
  });
  it("is hidden on a period without today, with nothing due, and while Search or a category is active", () => {
    expect(cardVisible(false, due, false)).toBe(false);
    expect(cardVisible(true, [], false)).toBe(false);
    expect(cardVisible(true, due, true)).toBe(false);
  });
});
