import { describe, expect, it } from "vitest";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { NO_ACCOUNT, spendAccount, summarize, type AccountFilter } from "../src/data/summary";

const t = "2026-10-01T00:00:00Z";
const e = (id: string, date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date, amount, currency: "PHP", createdAt: t, updatedAt: t, ...extra });

// Bank A (A1) and Card A (C1) are live; Old card (C9) was removed.
const live = ["A1", "C1"];
const entries: Entry[] = [
  e("food", "2026-10-02", 10000, { category: "Food", accountId: "A1" }),
  e("laptop", "2026-10-03", 300000, { category: "Shopping", accountId: "C1" }),
  e("pizza", "2026-10-04", 60000, { category: "Food", accountId: "C1", split: { paidBy: "me", mode: "half", shares: [{ personId: "P1", amount: 30000 }] } }),
  // Alex paid; an older Add form still saved the default account on it.
  e("dinner", "2026-10-05", 40000, { category: "Food", accountId: "A1", split: { paidBy: "P1", mode: "i-owe", shares: [{ personId: "me", amount: 40000 }] } }),
  e("cash", "2026-10-06", 5000, { category: "Transport" }),
  e("old", "2026-10-07", 7000, { category: "Fun", accountId: "C9" }),
  e("refund", "2026-10-08", 50000, { kind: "income", refund: true, refundOf: "laptop", category: "Shopping", accountId: "C1" }),
  e("paybill", "2026-10-09", 200000, { kind: "transfer", category: "Card payment", accountId: "A1", toAccountId: "C1" }),
];
// A weekly plan on Bank A that moves to Card A from Oct 20.
const plan: Rule = { id: "r1", type: "recurring", kind: "expense", amount: 1000, currency: "PHP", category: "Bills", accountId: "A1", frequency: "weekly", start: "2026-10-06", updatedAt: t,
  revisions: [{ from: "2026-10-20", accountId: "C1" }] };
const items = ledgerItems(entries, [plan], "2026-10-01", "2026-10-31");
const sum = (account?: string) => summarize(items, "PHP", "2026-10-01", "2026-10-31", entries, account ? ({ account, live } satisfies AccountFilter) : undefined);

describe("Dashboard account filter", () => {
  it("no filter gives the same totals as before", () => {
    // 100 + 3000 + 300 (my half) + 400 (I owe) + 50 + 70 - 500 refund + plan 4 x 10
    expect(sum().total).toBe(10000 + 300000 + 30000 + 40000 + 5000 + 7000 - 50000 + 4000);
  });

  it("one bank or one card, refunds by their own account, card payments never", () => {
    expect(sum("A1").total).toBe(10000 + 2000); // food + plan Oct 6 and 13
    expect(sum("C1").total).toBe(300000 + 30000 - 50000 + 2000); // laptop + my half of pizza - refund + plan Oct 20 and 27
    expect(sum("C1").byCategory).toMatchObject([{ category: "Shopping", amount: 250000 }, { category: "Food", amount: 30000 }, { category: "Bills", amount: 2000 }]);
  });

  it("No account or removed: no account, a removed account, and splits someone else paid", () => {
    const s = sum(NO_ACCOUNT);
    expect(s.total).toBe(40000 + 5000 + 7000);
    expect(s.byDay[4]).toBe(40000); // the dinner Alex paid, though Bank A is stored on it
  });

  it("a split someone else paid has no spending account", () => {
    const dinner = items.find((it) => it.type === "entry" && it.entry.id === "dinner")!;
    expect(spendAccount(dinner)).toBeUndefined();
  });

  it("the filters add up to the unfiltered total", () => {
    expect(sum("A1").total + sum("C1").total + sum(NO_ACCOUNT).total).toBe(sum().total);
  });
});
