import { addDays, addMonths } from "./dates";
import { splitEvenly } from "./money";
import type { Entry, EntryKind, Frequency, IsoDate, Minor, Rule, Split } from "./schema";

/** One generated payment of a rule. Never stored; computed on demand. */
export interface Occurrence {
  ruleId: string;
  type: Rule["type"];
  kind: EntryKind;
  date: IsoDate;
  amount: Minor;
  currency: string;
  category?: string;
  note?: string;
  accountId?: string;
  split?: Split;
  /** 1-based position, set for installments. */
  index?: number;
  count?: number;
  /** Installments: total still unpaid after this payment. */
  remainingAfter?: Minor;
}

function dateAt(start: IsoDate, f: Frequency, i: number): IsoDate {
  if (f === "weekly") return addDays(start, 7 * i);
  return addMonths(start, f === "monthly" ? i : 12 * i);
}

/** Occurrences of `rule` with date in [from, to], minus skipped ones, with overrides applied. */
export function occurrences(rule: Rule, from: IsoDate, to: IsoDate): Occurrence[] {
  if (rule.deleted) return [];
  const out: Occurrence[] = [];
  const isInst = rule.type === "installment" && rule.count && rule.count > 0;
  const amounts = isInst && rule.total ? splitEvenly(rule.total, rule.count!) : undefined;
  const limit = isInst ? rule.count! : Infinity;
  const last = rule.end && rule.end < to ? rule.end : to;
  for (let i = 0; i < limit; i++) {
    const date = dateAt(rule.start, rule.frequency, i);
    if (date > last) break;
    if (date < from || rule.skipped?.includes(date)) continue;
    const ov = rule.overrides?.[date];
    const base = amounts ? (amounts[i] ?? rule.amount) : rule.amount;
    const o: Occurrence = {
      ruleId: rule.id,
      type: rule.type,
      kind: rule.kind,
      date,
      amount: ov?.amount ?? base,
      currency: rule.currency,
      category: rule.category,
      note: ov?.note ?? rule.note,
      accountId: rule.accountId,
      split: rule.split,
    };
    if (isInst) {
      o.index = i + 1;
      o.count = rule.count;
      o.remainingAfter = amounts ? amounts.slice(i + 1).reduce((a, b) => a + b, 0) : (rule.count! - i - 1) * rule.amount;
    }
    out.push(o);
  }
  return out;
}

export type LedgerItem =
  | { type: "entry"; date: IsoDate; entry: Entry }
  | { type: "occurrence"; date: IsoDate; occ: Occurrence };

/** Real entries plus generated occurrences in [from, to], newest date first. */
export function ledgerItems(entries: Entry[], rules: Rule[], from: IsoDate, to: IsoDate): LedgerItem[] {
  const items: LedgerItem[] = [];
  for (const e of entries) if (!e.deleted && e.date >= from && e.date <= to) items.push({ type: "entry", date: e.date, entry: e });
  for (const r of rules) for (const occ of occurrences(r, from, to)) items.push({ type: "occurrence", date: occ.date, occ });
  return items.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}
