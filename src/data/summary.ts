import { toBase } from "./base";
import { daysBetween } from "./dates";
import type { LedgerItem } from "./rules";
import type { IsoDate, Minor } from "./schema";
import { myShare } from "./splits";

export interface Summary {
  /** What expenses cost me, in the base currency (my share of splits). */
  total: Minor;
  byCategory: { category: string; amount: Minor }[];
  /** One value per day from `from`. */
  byDay: Minor[];
  /** Foreign amounts without a rate, left out of the totals. */
  unconverted: number;
}

export function summarize(items: LedgerItem[], base: string, from: IsoDate, to: IsoDate): Summary {
  const byDay: Minor[] = Array(daysBetween(from, to) + 1).fill(0);
  const cats = new Map<string, Minor>();
  let total = 0;
  let unconverted = 0;
  for (const it of items) {
    const x = it.type === "entry" ? it.entry : it.occ;
    if (x.kind !== "expense") continue;
    const mine = toBase({ amount: myShare(x.amount, x.split), currency: x.currency, rate: "rate" in x ? x.rate : undefined } as never, base);
    if (mine === undefined) {
      unconverted++;
      continue;
    }
    total += mine;
    const i = daysBetween(from, it.date);
    if (i >= 0 && i < byDay.length) byDay[i]! += mine;
    const c = x.category || "Other";
    cats.set(c, (cats.get(c) ?? 0) + mine);
  }
  const byCategory = [...cats.entries()].map(([category, amount]) => ({ category, amount })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  return { total, byCategory, byDay, unconverted };
}

/** Top `n` categories, the rest folded into "Other". */
export function topCategories(cats: Summary["byCategory"], n = 5): Summary["byCategory"] {
  if (cats.length <= n) return cats;
  const rest = cats.slice(n).reduce((a, c) => a + c.amount, 0);
  const head = cats.slice(0, n).filter((c) => c.category !== "Other");
  const other = rest + (cats.slice(0, n).find((c) => c.category === "Other")?.amount ?? 0);
  return [...head, { category: "Other", amount: other }];
}

/** Percent change from `prev` to `cur`, rounded; null when there is nothing to compare to. */
export function pctChange(cur: Minor, prev: Minor): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}
