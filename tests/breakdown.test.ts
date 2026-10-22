import { describe, expect, it } from "vitest";
import { ledgerItems } from "../src/data/rules";
import type { Entry } from "../src/data/schema";
import { summarize, topCategories } from "../src/data/summary";

const t = "2026-10-01T00:00:00Z";
const e = (id: string, date: string, amount: number, extra: Partial<Entry> = {}): Entry => ({ id, kind: "expense", date, amount, currency: "PHP", createdAt: t, updatedAt: t, ...extra });
const sum = (entries: Entry[], filter?: { account: string; live: string[] }) =>
  summarize(ledgerItems(entries, [], "2026-10-01", "2026-10-31"), "PHP", "2026-10-01", "2026-10-31", entries, filter);

describe("items per category", () => {
  const entries = [
    e("a", "2026-10-02", 10000, { category: "Food", note: "Lunch", accountId: "A1" }),
    e("b", "2026-10-03", 50000, { category: "Food", note: "Dinner", accountId: "C1" }),
    e("c", "2026-10-04", 20000, { category: "Food", accountId: "A1" }), // no note: listed by its category
    e("d", "2026-10-01", 20000, { category: "Food", note: "Snacks", accountId: "A1" }), // ties c, earlier
    // my half of a split shows as my share
    e("f", "2026-10-06", 80000, { category: "Food", note: "Pizza", accountId: "A1", split: { paidBy: "me", mode: "half", shares: [{ personId: "P1", amount: 40000 }] } }),
    // a foreign charge in base currency
    e("g", "2026-10-07", 1000, { category: "Travel", note: "Hotel", currency: "USD", rate: "50", accountId: "C1" }),
    e("h", "2026-10-08", 30000, { category: "Shopping", note: "Laptop", accountId: "C1" }),
    e("r", "2026-10-09", 10000, { kind: "income", refund: true, refundOf: "h", category: "Shopping", note: "Laptop refund", accountId: "C1" }),
  ];

  it("keeps the 3 largest by my share, the earliest first on a tie", () => {
    const food = sum(entries).byCategory.find((c) => c.category === "Food")!;
    expect(food.top).toEqual([
      { label: "Dinner", date: "2026-10-03", amount: 50000 },
      { label: "Pizza", date: "2026-10-06", amount: 40000 },
      { label: "Snacks", date: "2026-10-01", amount: 20000 },
    ]);
  });

  it("converts foreign items and never lists a refund, though it still lowers the total", () => {
    const cats = sum(entries).byCategory;
    expect(cats.find((c) => c.category === "Travel")!.top).toEqual([{ label: "Hotel", date: "2026-10-07", amount: 50000 }]);
    const shop = cats.find((c) => c.category === "Shopping")!;
    expect(shop.amount).toBe(20000);
    expect(shop.top).toEqual([{ label: "Laptop", date: "2026-10-08", amount: 30000 }]);
  });

  it("follows the account filter", () => {
    const food = sum(entries, { account: "C1", live: ["A1", "C1"] }).byCategory.find((c) => c.category === "Food")!;
    expect(food.top!.map((i) => i.label)).toEqual(["Dinner"]);
  });
});

describe("the fold, Everything else", () => {
  const cats = [
    { category: "Rent", amount: 900 }, { category: "Food", amount: 500 }, { category: "Other", amount: 300, top: [{ label: "Gift", date: "2026-10-02", amount: 300 }] },
    { category: "Bills", amount: 200 }, { category: "Fun", amount: 150 }, { category: "Health", amount: 100 }, { category: "Pets", amount: 120 },
  ].sort((a, b) => b.amount - a.amount);

  it("lists its member categories, a real Other among them, largest first, and keeps the total", () => {
    const t = topCategories(cats, 5);
    expect(t.map((c) => c.category)).toEqual(["Rent", "Food", "Bills", "Fun", "Everything else"]);
    const other = t[4]!;
    expect(other.members).toEqual([{ category: "Other", amount: 300 }, { category: "Pets", amount: 120 }, { category: "Health", amount: 100 }]);
    expect(other.amount).toBe(520);
    expect(t.reduce((a, c) => a + c.amount, 0)).toBe(cats.reduce((a, c) => a + c.amount, 0));
  });

  it("with nothing to fold, a real Other keeps its own items", () => {
    const few = cats.slice(0, 4);
    expect(topCategories(few, 5)).toBe(few);
    expect(topCategories(few, 5).find((c) => c.category === "Other")!.top).toHaveLength(1);
  });
});
