import type { LedgerItem } from "./rules";
import type { IsoDate, Minor, SplitMode } from "./schema";

/** One thing that moved the balance with a person. amount > 0: they owe me. amount < 0: I owe them. */
export interface Line {
  id: string;
  date: IsoDate;
  label: string;
  amount: Minor;
  currency: string;
  settlement?: boolean;
  mode?: SplitMode;
}

export type ByCurrency = Record<string, Minor>;

/** Everything that affects my balance with one person, oldest first. Zero-amount lines are dropped. */
export function personLines(personId: string, items: LedgerItem[]): Line[] {
  const out: Line[] = [];
  for (const it of items) {
    const x = it.type === "entry" ? it.entry : it.occ;
    const id = it.type === "entry" ? it.entry.id : `${it.occ.ruleId}@${it.date}`;
    const label = x.note || x.category || "Expense";
    if (x.kind === "settlement") {
      if (it.type !== "entry" || it.entry.personId !== personId) continue;
      const sign = it.entry.direction === "in" ? -1 : 1;
      out.push({ id, date: it.date, label: "Settled up", amount: sign * x.amount, currency: x.currency, settlement: true });
      continue;
    }
    if (x.kind !== "expense" || !x.split) continue;
    const { paidBy, shares, mode } = x.split;
    let amount = 0;
    if (paidBy === "me") amount = shares.find((s) => s.personId === personId)?.amount ?? 0;
    else if (paidBy === personId) amount = -(shares.find((s) => s.personId === "me")?.amount ?? 0);
    if (amount !== 0) out.push({ id, date: it.date, label, amount, currency: x.currency, mode });
  }
  // Same day: settlements come last, so a payment made today covers today's expenses.
  const rank = (l: Line) => (l.settlement ? 1 : 0);
  return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : rank(a) !== rank(b) ? rank(a) - rank(b) : a.id < b.id ? -1 : 1));
}

export function sumBy(lines: Line[]): ByCurrency {
  const t: ByCurrency = {};
  for (const l of lines) t[l.currency] = (t[l.currency] ?? 0) + l.amount;
  return t;
}

export interface Statement {
  /** Balance carried in from before the last settlement, per currency (empty if none). */
  earlier: ByCurrency;
  /** Lines after the last settlement. */
  lines: Line[];
  net: ByCurrency;
}

/** Lines since the last settlement, with everything before it rolled into one carried balance. */
export function statementOf(lines: Line[]): Statement {
  let last = -1;
  lines.forEach((l, i) => { if (l.settlement) last = i; });
  const earlier = last >= 0 ? sumBy(lines.slice(0, last + 1)) : {};
  const recent = lines.slice(last + 1);
  return { earlier, lines: recent, net: sumBy(lines) };
}

/** Drop currencies that are exactly settled. */
export const nonZero = (b: ByCurrency): [string, Minor][] => Object.entries(b).filter(([, v]) => v !== 0);
