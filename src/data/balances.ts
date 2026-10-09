import { toBase } from "./base";
import type { LedgerItem } from "./rules";
import type { IsoDate, Minor, Person, SplitMode } from "./schema";

/** One thing that moved the balance with a person. amount > 0: they owe me. amount < 0: I owe them. */
export interface Line {
  id: string;
  date: IsoDate;
  label: string;
  amount: Minor;
  currency: string;
  settlement?: boolean;
  mode?: SplitMode;
  /** The entry's exchange rate, when it is in a foreign currency and has one. */
  rate?: string;
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
    if (amount !== 0) out.push({ id, date: it.date, label, amount, currency: x.currency, mode, rate: "rate" in x ? x.rate : undefined });
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

export interface PersonOwed {
  person: Person;
  /** Exact balance per currency. Positive: they owe me. */
  byCurrency: ByCurrency;
  /** The same in the base currency (currencies that cannot be converted are left out). */
  base: Minor;
  /** True when part of the balance is in another currency. */
  foreign: boolean;
}

export interface OwedSummary {
  people: PersonOwed[];
  /** Total others owe me, base currency. */
  owedToMe: Minor;
  /** Total I owe others, base currency, as a positive number. */
  iOwe: Minor;
  /** owedToMe - iOwe. */
  net: Minor;
  /** Currency balances left out because no exchange rate is known for them. */
  skipped: number;
}

/**
 * Who owes whom, for the Dashboard and the forecast. Each person's net is worked out per currency
 * first (so a foreign balance that is settled counts as zero), then converted with the most recent
 * rate seen for that currency on that person's lines.
 */
export function owedSummary(people: Person[], items: LedgerItem[], base: string): OwedSummary {
  const out: PersonOwed[] = [];
  let skipped = 0;
  for (const person of people) {
    const lines = personLines(person.id, items);
    const byCurrency = Object.fromEntries(nonZero(sumBy(lines)));
    const currencies = Object.keys(byCurrency);
    if (!currencies.length) continue;
    let total = 0;
    for (const cur of currencies) {
      const rate = [...lines].reverse().find((l) => l.currency === cur && l.rate)?.rate;
      const v = toBase({ amount: byCurrency[cur]!, currency: cur, rate }, base);
      if (v === undefined) skipped++;
      else total += v;
    }
    out.push({ person, byCurrency, base: total, foreign: currencies.some((c) => c !== base) });
  }
  out.sort((a, b) => Math.abs(b.base) - Math.abs(a.base) || (a.person.name < b.person.name ? -1 : 1));
  const owedToMe = out.reduce((n, p) => n + Math.max(p.base, 0), 0);
  const iOwe = out.reduce((n, p) => n + Math.max(-p.base, 0), 0);
  return { people: out, owedToMe, iOwe, net: owedToMe - iOwe, skipped };
}
