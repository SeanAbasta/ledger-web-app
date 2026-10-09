import { addDays, addMonths } from "./dates";
import { splitEvenly } from "./money";
import type { Entry, EntryKind, Frequency, IsoDate, Minor, Rule, RuleRevision, Split } from "./schema";

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
  /** The amount before any per-date override. */
  baseAmount: Minor;
  /** 1-based position, set for installments. */
  index?: number;
  count?: number;
  /** Installments: total still unpaid after this payment. */
  remainingAfter?: Minor;
}

type Base = Pick<RuleRevision, "amount" | "note" | "category" | "accountId">;

/** What a payment on `date` looks like from the rule and its revisions, before any per-date override. */
export function baseFor(rule: Rule, date: IsoDate): Required<Pick<Base, "amount">> & Omit<Base, "amount"> {
  const out: Base = { amount: rule.amount, note: rule.note, category: rule.category, accountId: rule.accountId };
  if (rule.type !== "installment") {
    for (const r of rule.revisions ?? []) {
      if (r.from > date) break; // kept oldest first
      if (r.amount !== undefined) out.amount = r.amount;
      if (r.note !== undefined) out.note = r.note;
      if (r.category !== undefined) out.category = r.category;
      if (r.accountId !== undefined) out.accountId = r.accountId;
    }
  }
  return out as Required<Pick<Base, "amount">> & Omit<Base, "amount">;
}

/**
 * "This and later": from `from` onward the payment becomes `patch`. Revisions and per-date
 * overrides dated after `from` are dropped, since they were about the old arrangement.
 */
export function applyRevision(rule: Rule, from: IsoDate, patch: Base): Rule {
  const revisions = (rule.revisions ?? []).filter((r) => r.from < from);
  revisions.push({ from, ...patch });
  const overrides = Object.fromEntries(Object.entries(rule.overrides ?? {}).filter(([d]) => d < from));
  return { ...rule, revisions, overrides };
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
    const rev = baseFor(rule, date);
    const base = amounts ? (amounts[i] ?? rule.amount) : rev.amount;
    const o: Occurrence = {
      ruleId: rule.id,
      type: rule.type,
      kind: rule.kind,
      date,
      amount: ov?.amount ?? base,
      baseAmount: base,
      currency: rule.currency,
      category: rev.category,
      note: ov?.note ?? rev.note,
      accountId: rev.accountId,
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

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Newest first: later days first, and inside a day the most recently added entry first (by
 * createdAt, then id; editing keeps createdAt, so an edit never reorders). Generated payments have
 * no time, so they count as the start of their day and sit below that day's entries.
 */
export function newestFirst(a: LedgerItem, b: LedgerItem): number {
  if (a.date !== b.date) return cmp(b.date, a.date);
  if (a.type !== b.type) return a.type === "entry" ? -1 : 1;
  if (a.type === "entry" && b.type === "entry") return cmp(b.entry.createdAt, a.entry.createdAt) || cmp(b.entry.id, a.entry.id);
  if (a.type === "occurrence" && b.type === "occurrence") return cmp(a.occ.ruleId, b.occ.ruleId);
  return 0;
}

/** Real entries plus generated occurrences in [from, to], newest first (see newestFirst). */
export function ledgerItems(entries: Entry[], rules: Rule[], from: IsoDate, to: IsoDate): LedgerItem[] {
  const items: LedgerItem[] = [];
  for (const e of entries) if (!e.deleted && e.date >= from && e.date <= to) items.push({ type: "entry", date: e.date, entry: e });
  for (const r of rules) for (const occ of occurrences(r, from, to)) items.push({ type: "occurrence", date: occ.date, occ });
  return items.sort(newestFirst);
}
