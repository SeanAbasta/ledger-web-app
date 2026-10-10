import { describe, expect, it } from "vitest";
import { cardBreakdown, cardStatus } from "../src/data/cards";
import { reconcile, type BankFigures } from "../src/data/reconcile";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry } from "../src/data/schema";

const P = 100;
const e = (id: string, date: string, pesos: number, extra: Partial<Entry> = {}): Entry => ({
  id, kind: "expense", date, amount: pesos * P, currency: "PHP", category: "Food", accountId: "C", createdAt: id, updatedAt: "x", ...extra,
});
// Made-up card: cut-off on the 8th, so on Oct 10 the Oct 8 statement is out and Oct 9 is unbilled.
const card: Account = { id: "C", name: "Visa", currency: "PHP", openingBalance: 0, type: "card", statementDay: 8, dueDays: 18, limit: 100000 * P, updatedAt: "x" };
const half = { paidBy: "me" as const, mode: "half" as const, shares: [{ personId: "m", amount: 300 * P }] };
const entries = [e("a", "2026-10-07", 1000), e("b", "2026-10-08", 400), e("c", "2026-10-08", 600, { split: half }), e("d", "2026-10-09", 300), e("x", "2026-10-05", 250, { accountId: "B" })];
const today = "2026-10-10";

const run = (bank: BankFigures, es: Entry[] = entries, c: Account = card) => {
  const items = ledgerItems(es, [], "0000-01-01", today);
  return reconcile(c.id, cardStatus(c, items, [], today), cardBreakdown(c, items, today), items, bank);
};
const ids = (cause: { item?: { type: string; entry?: Entry } }) => (cause.item?.type === "entry" ? cause.item.entry!.id : undefined);

describe("reconcile with the bank", () => {
  it("says what matches, and checks only the figures typed", () => {
    // Ledger: statement 2,000, owed now 2,300, credit left 97,700.
    const r = run({ statement: 2000 * P, available: 97700 * P });
    expect(r.map((c) => [c.field, c.diff, c.causes])).toEqual([["statement", 0, []], ["available", 0, []]]);
    expect(run({})).toEqual([]);
    expect(run({ available: 1 }, entries, { ...card, limit: undefined })).toEqual([]); // no limit: nothing to compare
  });
  it("a statement gap equal to the charges on one day points at posting lag", () => {
    const [c] = run({ statement: 1000 * P });
    expect(c).toMatchObject({ field: "statement", ledger: 2000 * P, bank: 1000 * P, diff: 1000 * P });
    const posting = c!.causes.find((x) => x.kind === "posting");
    expect(posting).toMatchObject({ kind: "posting", date: "2026-10-08" });
    expect(posting!.kind === "posting" && posting!.lines.map((l) => l.amount)).toEqual([400 * P, 600 * P]);
    expect(c!.causes.some((x) => x.kind === "entry" && ids(x) === "a")).toBe(true); // a single 1,000 charge also fits
  });
  it("an outstanding gap equal to everything since the cut-off is pending at the bank", () => {
    const [c] = run({ outstanding: 2000 * P });
    expect(c!.diff).toBe(300 * P);
    expect(c!.causes[0]).toEqual({ kind: "pending", amount: 300 * P });
    expect(c!.causes.some((x) => x.kind === "entry" && ids(x) === "d")).toBe(true);
  });
  it("when the bank has more, an expense on another account may belong on this card", () => {
    const [c] = run({ statement: 2250 * P });
    expect(c!.diff).toBe(-250 * P);
    expect(c!.causes).toEqual([expect.objectContaining({ kind: "entry", onCard: false })]);
    expect(ids(c!.causes[0] as never)).toBe("x");
  });
  it("a gap equal to a split share is named", () => {
    const [c] = run({ statement: 1700 * P });
    expect(c!.causes).toEqual([expect.objectContaining({ kind: "share", share: 300 * P })]);
  });
  it("available credit compares the other way round", () => {
    const [c] = run({ available: 98000 * P }); // the bank shows 300 more credit: Ledger shows 300 more owed
    expect(c!.diff).toBe(300 * P);
    expect(c!.causes[0]).toEqual({ kind: "pending", amount: 300 * P });
  });
  it("nothing matching means an earlier balance, interest or a fee", () => {
    const [c] = run({ available: 9666407 }); // like the Oct 9 case: 1,035.93 that Ledger did not know about
    expect(c!.diff).toBe(-103593);
    expect(c!.causes).toEqual([{ kind: "unknown" }]);
  });
});
