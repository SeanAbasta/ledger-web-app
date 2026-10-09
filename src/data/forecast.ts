import { toBase } from "./base";
import { cardStatus, dueFor, nextCutoff } from "./cards";
import { addDays, addMonths, daysInMonth, monthEnd, monthStart, parts } from "./dates";
import { ledgerItems, occurrences } from "./rules";
import { isCard, type Account, type Entry, type IsoDate, type Minor, type Rule } from "./schema";
import { myRefund, myShare } from "./splits";

export interface ForecastMonth {
  /** "YYYY-MM-01" */
  month: IsoDate;
  income: Minor;
  /** Recurring, installments and future-dated entries, except those on a card. */
  obligations: Minor;
  /** Card bills that fall due this month (statements, paid from the bank on their due date). */
  cards: Minor;
  /** Estimated everyday spending. */
  variable: Minor;
  /** Money owed to me (net of what I owe) expected back this month. Only set on the first month. */
  owed: Minor;
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
 * What each card's bills take from the bank, by due date. The last statement and what is unbilled
 * today are real charges at their full amount (other people's part of a split is already in
 * `owed`). Later charges on the card (installments, recurring, future-dated entries) go on the
 * statement they fall in, at my share, like other future spending.
 */
export function cardBills(cards: Account[], entries: Entry[], rules: Rule[], today: IsoDate, until: IsoDate, base: string): { due: IsoDate; amount: Minor }[] {
  const out: { due: IsoDate; amount: Minor }[] = [];
  if (!cards.length) return out;
  const past = ledgerItems(entries, rules, "0000-01-01", today);
  const byId = new Map(entries.map((e) => [e.id, e]));
  // Future things on a card, signed: charges add to the bill, refunds take off it.
  const future: { date: IsoDate; accountId: string; amount: Minor }[] = [];
  for (const r of rules) {
    for (const o of occurrences(r, addDays(today, 1), until)) {
      if (o.kind !== "expense" || !o.accountId) continue;
      future.push({ date: o.date, accountId: o.accountId, amount: toBase({ amount: myShare(o.amount, o.split), currency: o.currency }, base) ?? 0 });
    }
  }
  for (const e of entries) {
    if (e.date <= today || e.date > until || !e.accountId) continue;
    if (e.kind === "expense") future.push({ date: e.date, accountId: e.accountId, amount: spend(e, base) });
    else if (e.kind === "income") future.push({ date: e.date, accountId: e.accountId, amount: -(toBase({ ...e, amount: myRefund(e, byId) }, base) ?? 0) });
  }
  for (const card of cards) {
    const st = cardStatus(card, past, rules, today);
    // A statement past its due date that is still unpaid is assumed to be paid tomorrow.
    if (st.remaining) out.push({ due: st.due > today ? st.due : addDays(today, 1), amount: st.remaining });
    let from = st.cutoff;
    let carried = st.unbilled;
    // One statement per cycle, until the cycles start after the horizon.
    while (from <= until) {
      const c = nextCutoff(card, from);
      const amount = carried + future.filter((f) => f.accountId === card.id && f.date > from && f.date <= c).reduce((n, f) => n + f.amount, 0);
      if (amount) out.push({ due: dueFor(card, c), amount });
      carried = 0;
      from = c;
    }
  }
  return out;
}

/**
 * Month-end balance projection. Assumptions: split amounts are settled (only my share is spent),
 * and what people owe me (net of what I owe them, `owed`) comes back during the current month,
 * everyday spending repeats the average of the last 3 full months, and what is left of the
 * current month is prorated by days. Foreign amounts without a rate are ignored. `start` is cash
 * only: anything on a card leaves the bank when its statement is due, not when it was spent.
 */
export function forecast(opts: {
  start: Minor;
  today: IsoDate;
  base: string;
  entries: Entry[];
  rules: Rule[];
  months?: number;
  /** Net amount owed to me in the base currency (owedSummary().net). */
  owed?: Minor;
  /** All accounts; the credit cards among them get their bills on due dates. */
  accounts?: Account[];
}): Forecast {
  const { start, today, base, rules } = opts;
  const entries = opts.entries.filter((e) => !e.deleted);
  const n = opts.months ?? 12;
  const thisMonth = monthStart(today);
  const cards = (opts.accounts ?? []).filter(isCard);
  const onCard = (accountId?: string) => !!accountId && cards.some((c) => c.id === accountId);
  const byId = new Map(entries.map((e) => [e.id, e]));

  // Average everyday spending from real entries over up to 3 completed months. Refunds lower it.
  const expenses = entries.filter((e) => e.kind === "expense");
  const refunds = entries.filter((e) => e.kind === "income" && e.refund);
  const first = expenses.map((e) => monthStart(e.date)).sort()[0];
  let basis = 0;
  let sum = 0;
  for (let i = 1; i <= 3; i++) {
    const m = addMonths(thisMonth, -i);
    if (!first || m < first) continue;
    basis++;
    for (const e of expenses) if (monthStart(e.date) === m) sum += spend(e, base);
    for (const e of refunds) if (monthStart(e.date) === m) sum -= toBase({ ...e, amount: myRefund(e, byId) }, base) ?? 0;
  }
  const avgVariable = basis ? Math.max(0, Math.round(sum / basis)) : 0;

  const bills = cardBills(cards, entries, rules, today, monthEnd(addMonths(thisMonth, n - 1)), base);

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
        if (o.date < from || onCard(o.accountId)) continue; // card items are in the card bills
        const v = toBase({ amount: o.kind === "expense" ? myShare(o.amount, o.split) : o.amount, currency: o.currency }, base) ?? 0;
        if (o.kind === "income") income += v;
        else if (o.kind === "expense") obligations += v;
      }
    }
    for (const e of entries) {
      if (e.date < ms || e.date > me) continue;
      if (e.kind === "income" && !e.refund) hasIncome = true;
      if (e.date < from || onCard(e.accountId)) continue;
      if (e.kind === "income") income += toBase(e, base) ?? 0; // a refund into the bank is cash back
      else if (e.kind === "expense" && e.date > today) obligations += spend(e, base);
    }
    const cardsDue = bills.filter((b) => b.due >= from && b.due <= me).reduce((a, b) => a + b.amount, 0);

    const dim = daysInMonth(...(parts(ms).slice(0, 2) as [number, number]));
    const variable = i === 0 ? Math.round((avgVariable * (dim - todayDay)) / dim) : avgVariable;
    const owed = i === 0 ? (opts.owed ?? 0) : 0;
    bal = bal + income + owed - obligations - variable - cardsDue;
    out.push({ month: ms, income, obligations, cards: cardsDue, variable, owed, end: bal, noIncome: !hasIncome });
  }
  return { months: out, avgVariable, basis };
}
