import { describe, expect, it } from "vitest";
import type { LedgerItem } from "../src/data/rules";
import type { Entry } from "../src/data/schema";
import { itemTags, tripTag } from "../src/features/ledger/rowTags";

const T = "2026-10-01T00:00:00.000Z";
const entry = (over: Partial<Entry> = {}): LedgerItem => ({
  type: "entry", date: "2026-10-03",
  entry: { id: "e1", kind: "expense", date: "2026-10-03", amount: 100, currency: "PHP", createdAt: T, updatedAt: T, ...over },
});

describe("row tags", () => {
  it("lists split, refund and next bill in one order", () => {
    const split = { paidBy: "me", mode: "half" as const, shares: [{ personId: "alex", amount: 50 }] };
    expect(itemTags(entry({ split, nextBill: true }))).toEqual(["split", "next bill"]);
    expect(itemTags(entry({ kind: "income", refund: true }))).toEqual(["refund"]);
    expect(itemTags(entry())).toEqual([]);
  });

  it("adds upcoming last", () => {
    expect(itemTags(entry({ nextBill: true }), { upcoming: true })).toEqual(["next bill", "upcoming"]);
  });

  it("names plan payments", () => {
    const occ = (type: "recurring" | "installment"): LedgerItem => ({ type: "occurrence", date: "2026-10-05", occ: { ruleId: "r", date: "2026-10-05", type, kind: "expense", amount: 1, currency: "PHP", index: 2, count: 6 } as never });
    expect(itemTags(occ("installment"))).toEqual(["2 of 6"]);
    expect(itemTags(occ("recurring"))).toEqual(["recurring"]);
  });

  it("the trip tag is the trip's name, else a plain Trip, and only for entries", () => {
    const names = new Map([["t1", "Trip A"]]);
    expect(tripTag(entry({ tripId: "t1" }), names)).toBe("Trip A");
    expect(tripTag(entry({ tripId: "gone" }), names)).toBe("Trip");
    expect(tripTag(entry(), names)).toBeUndefined();
  });
});
