import { toBase } from "./base";
import type { CardStatus } from "./cards";
import { daysBetween } from "./dates";
import type { LedgerItem } from "./rules";
import type { Entry, IsoDate, Minor } from "./schema";
import { myRefund, myShare } from "./splits";

export interface Summary {
  /** What expenses cost me, in the base currency (my share of splits). */
  total: Minor;
  byCategory: { category: string; amount: Minor }[];
  /** One value per day from `from`. */
  byDay: Minor[];
  /** Foreign amounts without a rate, left out of the totals. */
  unconverted: number;
}

/** The Dashboard filter choice for spending with no account or on a removed one (the Accounts card's "Other"). */
export const NO_ACCOUNT = "none";

/**
 * The account a piece of spending came out of, for the Dashboard filter. A split someone else paid
 * has none, even when an account is stored on it (older Add forms saved the default): none of my money moved.
 */
export function spendAccount(it: LedgerItem): string | undefined {
  const x = it.type === "entry" ? it.entry : it.occ;
  return x.split && x.split.paidBy !== "me" ? undefined : x.accountId;
}

/** Account filter: one account by id, or NO_ACCOUNT for no account or one not in `live` (removed). */
export interface AccountFilter {
  account: string;
  live: string[];
}

export function matchesAccount(it: LedgerItem, f?: AccountFilter): boolean {
  if (!f) return true;
  const a = spendAccount(it);
  return f.account === NO_ACCOUNT ? !a || !f.live.includes(a) : a === f.account;
}

/**
 * Spending from `from` to `to`. Refunds count against the category they came back to. `all` is
 * used to find the expense a refund belongs to (for my share of a split one). With `filter`, only
 * spending on that account counts (a refund by the account it came back to).
 */
export function summarize(items: LedgerItem[], base: string, from: IsoDate, to: IsoDate, all: Entry[] = [], filter?: AccountFilter): Summary {
  const byId = new Map([...all, ...items.flatMap((it) => (it.type === "entry" ? [it.entry] : []))].map((e) => [e.id, e]));
  const byDay: Minor[] = Array(daysBetween(from, to) + 1).fill(0);
  const cats = new Map<string, Minor>();
  let total = 0;
  let unconverted = 0;
  for (const it of items) {
    const x = it.type === "entry" ? it.entry : it.occ;
    const refund = it.type === "entry" && it.entry.refund;
    if (x.kind !== "expense" && !refund) continue;
    if (!matchesAccount(it, filter)) continue;
    const amount = refund ? -myRefund(it.entry, byId) : myShare(x.amount, x.split);
    const mine = toBase({ amount, currency: x.currency, rate: "rate" in x ? x.rate : undefined } as never, base);
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

export interface DailyStats {
  /** Spent per elapsed day; 0 before any day has passed. */
  average: Minor;
  /** The highest day (the earliest on a tie), only when something was spent that day. */
  peak?: { index: number; amount: Minor };
  /** Elapsed days with nothing spent (a refund day does not count as quiet). */
  quietDays: number;
}

/** `elapsed` is how many days of `byDay` have happened: today's day number, or the whole month once it is past. */
export function dailyStats(byDay: Minor[], elapsed: number): DailyStats {
  const days = byDay.slice(0, Math.max(0, elapsed));
  const average = days.length ? Math.round(days.reduce((a, v) => a + v, 0) / days.length) : 0;
  let peak: DailyStats["peak"];
  days.forEach((amount, index) => {
    if (amount > 0 && (!peak || amount > peak.amount)) peak = { index, amount };
  });
  return { average, peak, quietDays: days.filter((v) => v === 0).length };
}

export interface WhatIf {
  /** The owed net (negative when I owe) and Total with it added. */
  owed?: { amount: Minor; after: Minor };
  /** What is owed on all cards today and Total with it paid. */
  cards?: { amount: Minor; after: Minor };
}

/**
 * The Accounts card's "what if" lines. Each is worked out from `total`, not stacked on the other.
 * A card counts statement remaining plus unbilled (future installment holds are not owed yet); a card
 * that is paid ahead counts as zero. A pair is left out when its amount is zero.
 */
export function accountsWhatIf(total: Minor, owedNet: Minor, cards: Pick<CardStatus, "remaining" | "unbilled">[]): WhatIf {
  const owing = cards.reduce((a, c) => a + Math.max(0, c.remaining + c.unbilled), 0);
  return {
    owed: owedNet !== 0 ? { amount: owedNet, after: total + owedNet } : undefined,
    cards: owing > 0 ? { amount: owing, after: total - owing } : undefined,
  };
}
