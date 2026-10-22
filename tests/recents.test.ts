import { describe, expect, it } from "vitest";
import { recents } from "../src/features/add/recents";
import type { Entry, Split } from "../src/data/schema";

// Made-up entries. Today is Oct 22, 2026.
const TODAY = "2026-10-22";
let n = 0;
const e = (date: string, note: string, extra: Partial<Entry> = {}): Entry => ({
  id: `E${++n}`, kind: "expense", date, amount: 50000 + n, currency: "PHP", category: "Food", note, createdAt: `${date}T0${n % 10}:00:00Z`, updatedAt: "x", ...extra,
});
const even = (who = "alex"): Split => ({ paidBy: "me", mode: "half", shares: [{ personId: who, amount: 1 }] });

describe("recents: the Again chips", () => {
  it("only notes used at least three times in the last 30 days", () => {
    const es = [e("2026-10-01", "Lunch"), e("2026-10-05", "Lunch"), e("2026-10-20", "Lunch"), e("2026-10-10", "Taxi"), e("2026-10-11", "Taxi")];
    expect(recents(es, TODAY).map((a) => a.note)).toEqual(["Lunch"]);
  });
  it("entries older than 30 days, deleted entries, income and refunds do not count", () => {
    const es = [e("2026-09-01", "Lunch"), e("2026-10-05", "Lunch"), e("2026-10-06", "Lunch", { deleted: true }), e("2026-10-07", "Lunch", { kind: "income" }), e("2026-10-08", "Lunch")];
    expect(recents(es, TODAY)).toEqual([]);
  });
  it("most used first, then most recent; at most four", () => {
    const notes = ["A", "B", "C", "D", "E"];
    const es = notes.flatMap((x, i) => Array.from({ length: 3 + (i === 2 ? 2 : 0) }, (_, k) => e(`2026-10-${String(10 + k + i).padStart(2, "0")}`, x)));
    const r = recents(es, TODAY);
    expect(r).toHaveLength(4);
    expect(r[0]!.note).toBe("C");
    expect(r.map((a) => a.note)).toEqual(["C", "E", "D", "B"]);
  });
  it("matches notes without regard to case or spaces, and keeps the latest spelling", () => {
    const es = [e("2026-10-01", "lunch"), e("2026-10-02", "Lunch "), e("2026-10-03", "Lunch")];
    expect(recents(es, TODAY)).toMatchObject([{ note: "Lunch", uses: 3 }]);
  });
  it("takes the most common category and split, and never an amount", () => {
    const es = [
      e("2026-10-01", "Lunch", { split: even() }), e("2026-10-02", "Lunch", { split: even() }), e("2026-10-03", "Lunch", { category: "Fun" }),
      e("2026-10-04", "Lunch", { split: even("sam") }), e("2026-10-05", "Lunch", { split: even() }),
    ];
    const [a] = recents(es, TODAY);
    expect(a).toEqual({ note: "Lunch", category: "Food", split: { paidBy: "me", mode: "half", people: ["alex"] }, uses: 5, last: "2026-10-05" });
    expect(a).not.toHaveProperty("amount");
  });
  it("no split when most uses had none", () => {
    const es = [e("2026-10-01", "Coffee"), e("2026-10-02", "Coffee"), e("2026-10-03", "Coffee", { split: even() })];
    expect(recents(es, TODAY)[0]!.split).toBeUndefined();
  });
  it("a split someone else paid keeps its payer", () => {
    const theirs: Split = { paidBy: "sam", mode: "half", shares: [{ personId: "me", amount: 1 }] };
    const es = [1, 2, 3].map((d) => e(`2026-10-0${d}`, "Dinner", { split: theirs }));
    expect(recents(es, TODAY)[0]!.split).toEqual({ paidBy: "sam", mode: "half", people: ["sam"] });
  });
});
