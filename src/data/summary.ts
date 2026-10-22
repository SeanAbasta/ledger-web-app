import { toBase } from "./base";
import type { CardStatus } from "./cards";
import { daysBetween } from "./dates";
import type { LedgerItem } from "./rules";
import type { Entry, IsoDate, Minor } from "./schema";
import { myRefund, myShare } from "./splits";

/** One piece of spending in a category's breakdown: what it was, when, and what it cost me (base currency). */
export interface SpendItem {
  label: string;
  date: IsoDate;
  amount: Minor;
  /** Dated after today: scheduled, not spent yet (only set by plannedSummary). */
  planned?: true;
}

export interface CategorySpend {
  category: string;
  amount: Minor;
  /** The largest items (up to 3; refunds never listed), the earliest first on a tie. */
  top?: SpendItem[];
  /** Only on the folded "Other" from topCategories: the categories folded into it, largest first. */
  members?: { category: string; amount: Minor }[];
}

export interface Summary {
  /** What expenses cost me, in the base currency (my share of splits). */
  total: Minor;
  byCategory: CategorySpend[];
  /** One value per day from `from`. */
  byDay: Minor[];
  /** Foreign amounts without a rate, left out of the totals. */
  unconverted: number;
}

export interface PlannedSummary extends Summary {
  /** The part of `total` dated after today: scheduled payments and future-dated entries, not spent yet. */
  planned: Minor;
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
  return tally(items, base, from, to, all, filter);
}

/**
 * The Dashboard chart for a month that is not over: everything dated in it, spent so far plus what is
 * scheduled after `today` (plan payments and future-dated entries; my share of splits, nothing estimated).
 * `planned` is the scheduled part, and those items are marked in the breakdown.
 */
export function plannedSummary(items: LedgerItem[], base: string, from: IsoDate, to: IsoDate, today: IsoDate, all: Entry[] = [], filter?: AccountFilter): PlannedSummary {
  return tally(items, base, from, to, all, filter, today) as PlannedSummary;
}

function tally(items: LedgerItem[], base: string, from: IsoDate, to: IsoDate, all: Entry[], filter?: AccountFilter, today?: IsoDate): Summary | PlannedSummary {
  const byId = new Map([...all, ...items.flatMap((it) => (it.type === "entry" ? [it.entry] : []))].map((e) => [e.id, e]));
  const byDay: Minor[] = Array(daysBetween(from, to) + 1).fill(0);
  const cats = new Map<string, Minor>();
  const picks = new Map<string, SpendItem[]>();
  let total = 0;
  let unconverted = 0;
  let planned = 0;
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
    const later = today !== undefined && it.date > today;
    if (later) planned += mine;
    const i = daysBetween(from, it.date);
    if (i >= 0 && i < byDay.length) byDay[i]! += mine;
    const c = x.category || "Other";
    cats.set(c, (cats.get(c) ?? 0) + mine);
    if (!refund && mine > 0) picks.set(c, [...(picks.get(c) ?? []), { label: x.note || c, date: it.date, amount: mine, ...(later ? { planned: true as const } : {}) }]);
  }
  const topOf = (c: string) => (picks.get(c) ?? []).sort((a, b) => b.amount - a.amount || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 3);
  const byCategory = [...cats.entries()].map(([category, amount]) => ({ category, amount, top: topOf(category) })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  return today === undefined ? { total, byCategory, byDay, unconverted } : { total, byCategory, byDay, unconverted, planned };
}

/** The name of the folded bucket of small categories (it was "Other", which clashed with a category of that name). */
export const FOLD = "Everything else";

/**
 * Top `n` categories, the rest folded into FOLD ("Everything else"). The fold lists what went into it
 * (`members`, largest first; a real "Other" category among them keeps its name) instead of items.
 */
export function topCategories(cats: Summary["byCategory"], n = 5): Summary["byCategory"] {
  if (cats.length <= n) return cats;
  const head = cats.slice(0, n).filter((c) => c.category !== "Other");
  const folded = cats.filter((c) => !head.includes(c)).map(({ category, amount }) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  return [...head, { category: FOLD, amount: folded.reduce((a, c) => a + c.amount, 0), members: folded }];
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

export interface ForecastStats {
  /** The lowest and highest month-end balance in the range, the earliest month on a tie. */
  lowest?: { month: IsoDate; amount: Minor };
  highest?: { month: IsoDate; amount: Minor };
  /** The last month-end balance minus today's balance. */
  change: Minor;
  /** Months that end below zero. */
  below: number;
}

/** The Forecast chart's stat rows for the months shown (3, 6 or 12), starting from today's balance. */
export function forecastStats(start: Minor, months: { month: IsoDate; end: Minor }[]): ForecastStats {
  let lowest: ForecastStats["lowest"];
  let highest: ForecastStats["highest"];
  for (const m of months) {
    if (!lowest || m.end < lowest.amount) lowest = { month: m.month, amount: m.end };
    if (!highest || m.end > highest.amount) highest = { month: m.month, amount: m.end };
  }
  return { lowest, highest, change: (months[months.length - 1]?.end ?? start) - start, below: months.filter((m) => m.end < 0).length };
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
