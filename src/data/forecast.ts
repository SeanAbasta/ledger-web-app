import { toBase } from "./base";
import { addDays, addMonths, daysInMonth, monthEnd, monthStart, parts } from "./dates";
import { occurrences } from "./rules";
import type { Entry, IsoDate, Minor, Rule } from "./schema";
import { myShare } from "./splits";

export interface ForecastMonth {
  /** "YYYY-MM-01" */
  month: IsoDate;
  income: Minor;
  /** Recurring, installments and future-dated entries. */
  obligations: Minor;
  /** Estimated everyday spending. */
  variable: Minor;
  /** Projected balance at the end of the month. */
  end: Minor;
  /** True when no income at all is known for the month (past or future). */
  noIncome: boolean;
}

export interface Forecast {
  months: ForecastMonth[];
  avgVariable: Minor;
  /** How many past months the average is based on (0 to 3). */
  basis: number;
}

const spend = (e: { amount: Minor; currency: string; rate?: string; split?: Entry["split"] }, base: string) =>
  toBase({ amount: myShare(e.amount, e.split), currency: e.currency, rate: e.rate }, base) ?? 0;

/**
 * Month-end balance projection. Assumptions: split amounts are settled (only my share is spent),
 * everyday spending repeats the average of the last 3 full months, and what is left of the
 * current month is prorated by days. Foreign amounts without a rate are ignored.
 */
export function forecast(opts: {
  start: Minor;
  today: IsoDate;
  base: string;
  entries: Entry[];
  rules: Rule[];
  months?: number;
}): Forecast {
  const { start, today, base, rules } = opts;
  const entries = opts.entries.filter((e) => !e.deleted);
  const n = opts.months ?? 12;
  const thisMonth = monthStart(today);

  // Average everyday spending from real entries over up to 3 completed months.
  const expenses = entries.filter((e) => e.kind === "expense");
  const first = expenses.map((e) => monthStart(e.date)).sort()[0];
  let basis = 0;
  let sum = 0;
  for (let i = 1; i <= 3; i++) {
    const m = addMonths(thisMonth, -i);
    if (!first || m < first) continue;
    basis++;
    for (const e of expenses) if (monthStart(e.date) === m) sum += spend(e, base);
  }
  const avgVariable = basis ? Math.round(sum / basis) : 0;

  const [, , todayDay] = parts(today);
  const out: ForecastMonth[] = [];
  let bal = start;
  for (let i = 0; i < n; i++) {
    const ms = addMonths(thisMonth, i);
    const me = monthEnd(ms);
    const from = i === 0 ? addDays(today, 1) : ms; // what already happened is in the starting balance
    let income = 0;
    let obligations = 0;
    let hasIncome = false;

    for (const r of rules) {
      for (const o of occurrences(r, ms, me)) {
        if (o.kind === "income") hasIncome = true;
        if (o.date < from) continue;
        const v = toBase({ amount: o.kind === "expense" ? myShare(o.amount, o.split) : o.amount, currency: o.currency }, base) ?? 0;
        if (o.kind === "income") income += v;
        else if (o.kind === "expense") obligations += v;
      }
    }
    for (const e of entries) {
      if (e.date < ms || e.date > me) continue;
      if (e.kind === "income") hasIncome = true;
      if (e.date < from) continue;
      if (e.kind === "income") income += toBase(e, base) ?? 0;
      else if (e.kind === "expense" && e.date > today) obligations += spend(e, base);
    }

    const dim = daysInMonth(...(parts(ms).slice(0, 2) as [number, number]));
    const variable = i === 0 ? Math.round((avgVariable * (dim - todayDay)) / dim) : avgVariable;
    bal = bal + income - obligations - variable;
    out.push({ month: ms, income, obligations, variable, end: bal, noIncome: !hasIncome });
  }
  return { months: out, avgVariable, basis };
}
