// Pure trip math: no storage, no React. A trip's expenses are estimates until the statement figure is
// typed in; Conclude turns them into ordinary entries in the base currency.
import { addDays, daysBetween } from "./dates";
import { convertMinor } from "./money";
import { NO_ACCOUNT } from "./summary";
import { buildSplit, myShare, participants } from "./splits";
import type { Account, Entry, Minor, Person, Split, SplitShare, Trip, TripItem } from "./schema";
import { ulid } from "./ulid";

// ---- one item ------------------------------------------------------------------------------

/** The rate to estimate an item with: its own, else the trip's for that currency. */
export const rateFor = (i: Pick<TripItem, "currency" | "rate">, t: Pick<Trip, "rates">): string | undefined => i.rate || t.rates[i.currency];

/** An item needs a typed statement figure when it is in a foreign currency. */
export const needsFigure = (i: Pick<TripItem, "currency">, base: string): boolean => i.currency !== base;

/** Final: already in the base currency, or the statement figure has been typed. */
export const isFinal = (i: Pick<TripItem, "currency" | "final">, base: string): boolean => !needsFigure(i, base) || i.final !== undefined;

/** An item in the base currency, as the Ledger will hold it. `undefined` when it is foreign with no figure and no rate. */
export function baseOf(i: TripItem, t: Pick<Trip, "rates">, base: string): Minor | undefined {
  if (i.currency === base) return i.amount;
  if (i.final !== undefined) return i.final;
  const rate = rateFor(i, t);
  return rate ? convertMinor(i.amount, rate, i.currency, base) : undefined;
}

// ---- totals --------------------------------------------------------------------------------

export interface TripTotals {
  /** Net of refunds, in the base currency, counting only items that have an amount. */
  paid: Minor;
  /** Net of refunds, my part only (what the trip costs me once splits are settled). */
  mine: Minor;
  count: number;
  final: number;
  /** Foreign items with no rate and no figure: left out of the totals. */
  unrated: number;
  byCard: { accountId: string; paid: Minor; count: number; final: number }[];
  byCategory: { category: string; paid: Minor }[];
}

export function tripTotals(t: Trip, items: TripItem[], base: string): TripTotals {
  const live = items.filter((i) => !i.deleted);
  const byId = new Map(live.map((i) => [i.id, i]));
  const card = new Map<string, { accountId: string; paid: Minor; count: number; final: number }>();
  const cat = new Map<string, Minor>();
  let paid = 0, mine = 0, final = 0, unrated = 0;
  for (const i of live) {
    const b = baseOf(i, t, base);
    const f = isFinal(i, base);
    const key = i.accountId ?? NO_ACCOUNT;
    const row = card.get(key) ?? { accountId: key, paid: 0, count: 0, final: 0 };
    row.count++;
    if (f) { row.final++; final++; }
    if (b === undefined) { unrated++; card.set(key, row); continue; }
    const sign = i.refund ? -1 : 1;
    const share = i.refund ? refundShare(i, b, byId) : shareOf(i, b);
    paid += sign * b;
    mine += sign * share;
    row.paid += sign * b;
    card.set(key, row);
    const c = i.category || "Other";
    cat.set(c, (cat.get(c) ?? 0) + sign * share);
  }
  return {
    paid, mine, count: live.length, final, unrated,
    byCard: [...card.values()].sort((a, z) => (a.accountId < z.accountId ? -1 : 1)),
    byCategory: [...cat].map(([category, p]) => ({ category, paid: p })).sort((a, z) => z.paid - a.paid || (a.category < z.category ? -1 : 1)),
  };
}

/** My part of an item's base amount: the split's proportion of the amount the split was built on. */
const shareOf = (i: TripItem, b: Minor): Minor => (i.split && i.amount > 0 ? Math.round((b * myShare(i.amount, i.split)) / i.amount) : b);

/** My part of a refund: the same proportion I had of the expense it refunds. */
function refundShare(r: TripItem, b: Minor, byId: Map<string, TripItem>): Minor {
  const orig = r.refundOf ? byId.get(r.refundOf) : undefined;
  if (!orig?.split || orig.amount <= 0) return b;
  return Math.round((b * myShare(orig.amount, orig.split)) / orig.amount);
}

/** How much of the budget is left (negative when over), or undefined without a budget. */
export const budgetLeft = (t: Pick<Trip, "budget">, totals: Pick<TripTotals, "mine">): Minor | undefined => (t.budget === undefined ? undefined : t.budget - totals.mine);

/** Last day of the trip. */
export const tripEnd = (t: Pick<Trip, "start" | "days">) => addDays(t.start, t.days - 1);

/** Days left including today, 0 once the trip is over. A trip that has not started has all its days. */
export function daysLeft(t: Pick<Trip, "start" | "days">, today: string): number {
  if (today < t.start) return t.days;
  return Math.max(0, daysBetween(today, tripEnd(t)) + 1);
}

/** What is left to spend each day for the rest of the trip, or undefined when no budget or no days left. */
export function perDay(t: Pick<Trip, "budget" | "start" | "days">, totals: Pick<TripTotals, "mine">, today: string): Minor | undefined {
  const left = budgetLeft(t, totals);
  const d = daysLeft(t, today);
  return left === undefined || d === 0 ? undefined : Math.max(0, Math.floor(left / d));
}

/** Items still needing a statement figure. */
export const estimated = (items: TripItem[], base: string) => items.filter((i) => !i.deleted && !isFinal(i, base));

/** The day order of a statement: date, then amount, then id. */
export const statementOrder = (a: TripItem, z: TripItem) => (a.date !== z.date ? (a.date < z.date ? -1 : 1) : a.amount !== z.amount ? a.amount - z.amount : a.id < z.id ? -1 : 1);

// ---- rebuilding a split for the final amount -------------------------------------------------

/**
 * The same split on a new amount. Rule-based modes (half, they owe, I owe) are rebuilt with the same people
 * in the same order. Custom shares keep their proportions: each share is scaled, spare centavos go to the
 * largest remainders (earlier shares first on a tie), and the shares never add up to more than the amount.
 */
export function rebuildSplit(split: Split, oldAmount: Minor, newAmount: Minor): Split {
  if (split.mode !== "custom") return buildSplit({ amount: newAmount, paidBy: split.paidBy, mode: split.mode, people: participants(split) });
  const owed = split.shares.filter((s) => s.amount > 0);
  const sum = owed.reduce((a, s) => a + s.amount, 0);
  if (!sum || oldAmount <= 0) return { ...split, shares: [] };
  const exact = owed.map((s) => (s.amount * newAmount) / oldAmount);
  const target = Math.min(newAmount, Math.round((sum * newAmount) / oldAmount));
  const floors = exact.map(Math.floor);
  let spare = target - floors.reduce((a, n) => a + n, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, z) => z.r - a.r || a.i - z.i);
  for (const { i } of order) { if (spare <= 0) break; floors[i]! += 1; spare--; }
  const shares: SplitShare[] = owed.map((s, i) => ({ personId: s.personId, amount: floors[i]! })).filter((s) => s.amount > 0);
  return { paidBy: split.paidBy, mode: "custom", shares };
}

// ---- Conclude --------------------------------------------------------------------------------

export interface ConcludePlan {
  /** The entries to post, in the base currency, oldest day first. Empty when `problems` is not. */
  entries: Entry[];
  /** Why Conclude cannot go ahead yet, as sentences. */
  problems: string[];
  /** Per card or account, the count still needing a statement figure. */
  waiting: { accountId: string; count: number }[];
}

const nameOfAccount = (accounts: Account[], id: string) => (id === NO_ACCOUNT ? "no account" : accounts.find((a) => a.id === id)?.name ?? "a removed account");

/** "3 still need a statement figure: Card A 2, Bank A 1". */
export function waitingText(waiting: ConcludePlan["waiting"], accounts: Account[]): string {
  const n = waiting.reduce((a, w) => a + w.count, 0);
  return `${n} still need${n === 1 ? "s" : ""} a statement figure: ${waiting.map((w) => `${nameOfAccount(accounts, w.accountId)} ${w.count}`).join(", ")}`;
}

/**
 * Turn a trip's items into entries. Every entry is in the base currency with the statement figure as its
 * amount; a foreign price is kept in `local`. Splits are rebuilt for the final amount (people then owe
 * base currency, fee included), and refunds point at the new entry of the expense they refund.
 */
export function concludePlan(t: Trip, items: TripItem[], accounts: Account[], base: string, now = new Date().toISOString(), newId: () => string = ulid): ConcludePlan {
  const live = items.filter((i) => !i.deleted && i.tripId === t.id).sort(statementOrder);
  const problems: string[] = [];
  const open = estimated(live, base);
  const waitingMap = new Map<string, number>();
  for (const i of open) waitingMap.set(i.accountId ?? NO_ACCOUNT, (waitingMap.get(i.accountId ?? NO_ACCOUNT) ?? 0) + 1);
  const waiting = [...waitingMap].map(([accountId, count]) => ({ accountId, count })).sort((a, z) => z.count - a.count || (a.accountId < z.accountId ? -1 : 1));

  if (!live.length) problems.push("There is nothing in this trip to conclude");
  if (waiting.length) problems.push(waitingText(waiting, accounts));

  const unpaidByMe = (i: TripItem) => !!i.split && i.split.paidBy !== "me";
  const accountless = live.filter((i) => !i.accountId && !unpaidByMe(i)).length;
  if (accountless && accounts.some((a) => !a.deleted)) problems.push(`${accountless} ${accountless === 1 ? "has" : "have"} no card or account`);
  const gone = live.filter((i) => i.accountId && !accounts.some((a) => a.id === i.accountId && !a.deleted));
  if (gone.length) problems.push(`${gone.length} ${gone.length === 1 ? "is" : "are"} on a removed card or account`);
  const foreign = new Set(live.flatMap((i) => (i.accountId && accounts.some((a) => a.id === i.accountId && !a.deleted && a.currency !== base) ? [nameOfAccount(accounts, i.accountId)] : [])));
  if (foreign.size) problems.push(`${[...foreign].join(", ")} ${foreign.size === 1 ? "is" : "are"} not in ${base}; move those to a ${base} account`);

  const ids = new Map(live.map((i) => [i.id, newId()]));
  for (const r of live) {
    if (r.refund && (!r.refundOf || !ids.has(r.refundOf))) { problems.push("A refund points at an expense that is no longer in the trip"); break; }
  }
  // A foreign item with no figure is already reported as waiting, so past that point every item has an amount.
  const baseAmt = new Map(live.map((i) => [i.id, baseOf(i, t, base)]));
  if ([...refundTotals(live, baseAmt).values()].some((r) => r.refunded > r.expense)) problems.push("A refund is larger than the expense it refunds");
  if (problems.length) return { entries: [], problems, waiting };

  const entries: Entry[] = live.map((i) => {
    const amount = baseAmt.get(i.id)!;
    const e: Entry = {
      id: ids.get(i.id)!, kind: i.refund ? "income" : "expense", date: i.date, amount, currency: base,
      createdAt: now, updatedAt: now, tripId: t.id,
    };
    if (i.category) e.category = i.category;
    if (i.note) e.note = i.note;
    if (i.accountId) e.accountId = i.accountId;
    if (needsFigure(i, base)) e.local = { amount: i.amount, currency: i.currency };
    if (i.refund) { e.refund = true; e.refundOf = ids.get(i.refundOf!)!; }
    else if (i.split) e.split = rebuildSplit(i.split, i.amount, amount);
    return e;
  });
  return { entries, problems, waiting };
}

function refundTotals(live: TripItem[], baseAmt: Map<string, Minor | undefined>) {
  const m = new Map<string, { expense: Minor; refunded: Minor }>();
  for (const i of live) if (!i.refund) m.set(i.id, { expense: baseAmt.get(i.id) ?? 0, refunded: 0 });
  for (const r of live) if (r.refund && r.refundOf) { const row = m.get(r.refundOf); if (row) row.refunded += baseAmt.get(r.id) ?? 0; }
  return m;
}

// ---- what Conclude does to People ----------------------------------------------------------

export interface ConcludeSummary {
  count: number;
  from: string;
  to: string;
  /** Net cash out of my pocket on the posted entries, refunds taken off. */
  paid: Minor;
  /** Per person, net: positive means they owe me. */
  owed: { personId: string; amount: Minor }[];
}

export function concludeSummary(entries: Entry[]): ConcludeSummary {
  const owed = new Map<string, Minor>();
  let paid = 0;
  for (const e of entries) {
    paid += e.refund ? -e.amount : e.amount;
    const s = e.split;
    if (!s) continue;
    if (s.paidBy === "me") for (const sh of s.shares) { if (sh.personId !== "me") owed.set(sh.personId, (owed.get(sh.personId) ?? 0) + sh.amount); }
    else { const mine = s.shares.find((x) => x.personId === "me"); if (mine) owed.set(s.paidBy, (owed.get(s.paidBy) ?? 0) - mine.amount); }
  }
  const dates = entries.map((e) => e.date).sort();
  return {
    count: entries.length, from: dates[0] ?? "", to: dates[dates.length - 1] ?? "", paid,
    owed: [...owed].map(([personId, amount]) => ({ personId, amount })).filter((o) => o.amount !== 0).sort((a, z) => (a.personId < z.personId ? -1 : 1)),
  };
}

/** A sentence for the confirm: "Alex owes you ₱X" / "You owe Sam ₱Y". The caller formats the amounts. */
export function owedLines(owed: ConcludeSummary["owed"], people: Pick<Person, "id" | "name">[], fmt: (n: Minor) => string): string[] {
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";
  return owed.map((o) => (o.amount > 0 ? `${name(o.personId)} owes you ${fmt(o.amount)}` : `You owe ${name(o.personId)} ${fmt(-o.amount)}`));
}

// ---- the expense form ------------------------------------------------------------------------

/** A trip expense in the shape the expense form edits. Nothing here is stored as an entry. */
export const itemAsEntry = (i: TripItem): Entry => ({
  id: i.id, kind: "expense", date: i.date, amount: i.amount, currency: i.currency, createdAt: i.createdAt, updatedAt: i.updatedAt,
  ...(i.rate ? { rate: i.rate } : {}), ...(i.category ? { category: i.category } : {}), ...(i.note ? { note: i.note } : {}),
  ...(i.accountId ? { accountId: i.accountId } : {}), ...(i.split ? { split: i.split } : {}),
});

/** Today when it falls inside the trip, else the first day. */
export const defaultTripDate = (t: Pick<Trip, "start" | "days">, today: string): string => (today >= t.start && today <= tripEnd(t) ? today : t.start);
