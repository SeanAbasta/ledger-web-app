import { toBase } from "./base";
import { addDays, addMonths } from "./dates";
import { occurrences, type Occurrence } from "./rules";
import type { Frequency, IsoDate, Minor, Rule } from "./schema";
import { myShare } from "./splits";

/** One recurring or installment plan, as the Dashboard's Recurring list shows it. Nothing here is stored. */
export interface PlanRow {
  rule: Rule;
  /** The plan's note, else its category (as of its next payment, or its last one once ended). */
  label: string;
  /** The next payment after today; none once the plan has ended. */
  next?: Occurrence;
  /** The last payment on or before today, for ended plans. */
  last?: Occurrence;
  /** The next payment's amount (the last one's once ended), in the plan's currency. */
  amount: Minor;
  currency: string;
  frequency: Frequency;
  /** The account of the next (or last) payment, revisions included. */
  accountId?: string;
  split: boolean;
  /** Installments: payments made so far, the plan length and payments still to come. */
  progress?: { done: number; count: number; left: number };
  /** Recurring plans with an end date. */
  end?: IsoDate;
  /** What the plan costs me a month in the base currency (my share); undefined when ended or not convertible. */
  monthly?: Minor;
}

export interface PlanList {
  recurring: PlanRow[];
  installments: PlanRow[];
  ended: PlanRow[];
  /** Sum of `monthly` over the active plans. */
  perMonth: Minor;
  /** Active plans left out of `perMonth` because they are in another currency (plans store no rate). */
  unconverted: number;
}

/** A payment's monthly equivalent: weekly x 52 / 12, yearly / 12. */
export function perMonthOf(amount: Minor, f: Frequency): Minor {
  return Math.round(f === "weekly" ? (amount * 52) / 12 : f === "yearly" ? amount / 12 : amount);
}

/**
 * Every live recurring and installment plan (salary, type "income", belongs to the Forecast), split into
 * active ones (a payment after today exists) sorted by next date, and ended ones, the latest ended first.
 */
export function planList(rules: Rule[], today: IsoDate, base: string): PlanList {
  const out: PlanList = { recurring: [], installments: [], ended: [], perMonth: 0, unconverted: 0 };
  // Far enough ahead to find the next payment of a yearly plan even when a few are skipped.
  const horizon = addMonths(today, 12 * 5);
  for (const rule of rules) {
    if (rule.deleted || (rule.type !== "recurring" && rule.type !== "installment")) continue;
    const next = occurrences(rule, addDays(today, 1), horizon)[0];
    const last = next ? undefined : occurrences(rule, rule.start, today).at(-1);
    const shown = next ?? last;
    const row: PlanRow = {
      rule,
      label: shown?.note || shown?.category || rule.note || rule.category || "Plan",
      next,
      last,
      amount: shown?.amount ?? rule.amount,
      currency: rule.currency,
      frequency: rule.frequency,
      accountId: shown ? shown.accountId : rule.accountId,
      split: !!rule.split,
    };
    if (rule.type === "installment" && rule.count) {
      const done = next ? (next.index ?? 1) - 1 : rule.count;
      row.progress = { done, count: rule.count, left: rule.count - done };
    }
    if (rule.type === "recurring" && rule.end) row.end = rule.end;
    if (!next) {
      out.ended.push(row);
      continue;
    }
    const mine = toBase({ amount: myShare(next.amount, next.split), currency: next.currency }, base);
    if (mine === undefined) out.unconverted++;
    else {
      row.monthly = perMonthOf(mine, rule.frequency);
      out.perMonth += row.monthly;
    }
    (rule.type === "installment" ? out.installments : out.recurring).push(row);
  }
  const byNext = (a: PlanRow, b: PlanRow) => (a.next!.date < b.next!.date ? -1 : a.next!.date > b.next!.date ? 1 : a.label.localeCompare(b.label));
  out.recurring.sort(byNext);
  out.installments.sort(byNext);
  const lastDate = (r: PlanRow) => r.last?.date ?? r.rule.start;
  out.ended.sort((a, b) => (lastDate(a) > lastDate(b) ? -1 : lastDate(a) < lastDate(b) ? 1 : a.label.localeCompare(b.label)));
  return out;
}
