// The Dashboard's Year view: spending and income for one calendar year, month by month. Spending is the
// Dashboard's own summarize() over the same items for each month, so any single month agrees with the
// Dashboard to the centavo. Nothing here is stored.
import { toBase } from "./base";
import { addMonths, daysInMonth, iso, monthEnd, parts } from "./dates";
import { ledgerItems, type LedgerItem } from "./rules";
import type { Entry, IsoDate, Minor, Rule } from "./schema";
import { pctChange, summarize, topCategories, type CategorySpend } from "./summary";

export interface YearMonth {
  /** "YYYY-MM-01" */
  month: IsoDate;
  /** What I spent (my share; refunds subtract), base currency. */
  spent: Minor;
  /** Income entries (not refunds) and salary plan payments, base currency. */
  income: Minor;
  /** The month has started (on or before today). */
  happened: boolean;
}

export interface YearReport {
  year: number;
  /** Jan 1 and the last day counted: Dec 31 for a past year, today for this year. */
  from: IsoDate;
  to: IsoDate;
  /** The year has not started yet. */
  future: boolean;
  months: YearMonth[];
  spent: Minor;
  income: Minor;
  net: Minor;
  /** Top 5 categories plus Other, over the whole period. */
  categories: CategorySpend[];
  /** Spent per month over the months that have happened (this month included). */
  average: Minor;
  highest?: { month: IsoDate; amount: Minor };
  lowest?: { month: IsoDate; amount: Minor };
  /** The same dates a year earlier; undefined when nothing was spent then. */
  lastYear?: { spent: Minor; change: number | null };
  /** Foreign amounts with no rate, left out of the figures. */
  unconverted: number;
  /** Nothing spent and no income in the period. */
  empty: boolean;
}

/** Income in [from, to]: income entries that are not refunds, and payments of salary plans. */
function incomeIn(items: LedgerItem[], base: string): { amount: Minor; unconverted: number } {
  let amount = 0;
  let unconverted = 0;
  for (const it of items) {
    const x = it.type === "entry" ? it.entry : it.occ;
    if (x.kind !== "income" || (it.type === "entry" && it.entry.refund)) continue;
    const v = toBase(x, base);
    if (v === undefined) unconverted++;
    else amount += v;
  }
  return { amount, unconverted };
}

/** The same day a year earlier (Feb 29 becomes Feb 28). */
function yearBefore(d: IsoDate): IsoDate {
  const [y, m, day] = parts(d);
  return iso(y - 1, m, Math.min(day, daysInMonth(y - 1, m)));
}

/** Spending per month in [Jan 1, to], each worked out like the Dashboard does for that month. */
function monthsOf(entries: Entry[], rules: Rule[], base: string, year: number, to: IsoDate) {
  const out: { month: IsoDate; summary: ReturnType<typeof summarize>; items: LedgerItem[]; happened: boolean }[] = [];
  for (let i = 0; i < 12; i++) {
    const ms = addMonths(iso(year, 1, 1), i);
    const happened = ms <= to;
    const end = monthEnd(ms) < to ? monthEnd(ms) : to;
    const items = happened ? ledgerItems(entries, rules, ms, end) : [];
    out.push({ month: ms, summary: summarize(items, base, ms, monthEnd(ms), entries), items, happened });
  }
  return out;
}

export function yearReport(opts: { entries: Entry[]; rules: Rule[]; base: string; year: number; today: IsoDate }): YearReport {
  // Tombstones stay in: ledgerItems skips them, and summarize looks refunds up among all entries, as the Dashboard does.
  const { entries, rules, base, year, today } = opts;
  const from = iso(year, 1, 1);
  const yearEnd = iso(year, 12, 31);
  const to = yearEnd < today ? yearEnd : today;
  const future = from > today;

  const ms = monthsOf(entries, rules, base, year, to);
  let unconverted = 0;
  const months: YearMonth[] = ms.map((m) => {
    const inc = incomeIn(m.items, base);
    unconverted += m.summary.unconverted + inc.unconverted;
    return { month: m.month, spent: m.summary.total, income: inc.amount, happened: m.happened };
  });
  const spent = months.reduce((a, m) => a + m.spent, 0);
  const income = months.reduce((a, m) => a + m.income, 0);
  const whole = future ? undefined : summarize(ledgerItems(entries, rules, from, to), base, from, to, entries);

  const happened = months.filter((m) => m.happened);
  let highest: YearReport["highest"];
  let lowest: YearReport["lowest"];
  for (const m of happened) {
    if (!highest || m.spent > highest.amount) highest = { month: m.month, amount: m.spent };
    if (!lowest || m.spent < lowest.amount) lowest = { month: m.month, amount: m.spent };
  }

  let lastYear: YearReport["lastYear"];
  if (!future) {
    const prev = monthsOf(entries, rules, base, year - 1, yearBefore(to)).reduce((a, m) => a + m.summary.total, 0);
    if (prev > 0) lastYear = { spent: prev, change: pctChange(spent, prev) };
  }

  return {
    year, from, to, future, months, spent, income, net: income - spent,
    categories: whole ? topCategories(whole.byCategory) : [],
    average: happened.length ? Math.round(spent / happened.length) : 0,
    highest, lowest, lastYear, unconverted,
    empty: spent === 0 && income === 0 && !(whole?.byCategory.length),
  };
}
