// Credit card statements. Nothing here is stored: a card's statement, what is unbilled and the
// credit left are worked out from the card's entries, its rules and the date.
import { cashFlow } from "./accounts";
import { toBase } from "./base";
import { addDays, addMonths, iso, monthStart, parts, daysInMonth } from "./dates";
import { occurrences, type LedgerItem } from "./rules";
import { DEFAULT_DUE_DAYS, type Account, type IsoDate, type Minor, type Rule } from "./schema";

type Card = Pick<Account, "id" | "statementDay" | "dueDays" | "dueOverrides">;

/** The cut-off date in the month of `d`. Days 29 to 31 clamp to the month end. */
export function cutoffIn(card: Card, d: IsoDate): IsoDate {
  const [y, m] = parts(d);
  return iso(y, m, Math.min(card.statementDay ?? 31, daysInMonth(y, m)));
}

/** The latest cut-off on or before `d`. A statement is out on its cut-off day and includes that day. */
export function lastCutoff(card: Card, d: IsoDate): IsoDate {
  const c = cutoffIn(card, d);
  return c <= d ? c : cutoffIn(card, addMonths(monthStart(d), -1));
}

export const prevCutoff = (card: Card, c: IsoDate) => cutoffIn(card, addMonths(monthStart(c), -1));
export const nextCutoff = (card: Card, c: IsoDate) => cutoffIn(card, addMonths(monthStart(c), 1));

/** When the statement that closes on `cutoff` is due: a date set by hand, else cut-off + due days. */
export const dueFor = (card: Card, cutoff: IsoDate): IsoDate => card.dueOverrides?.[cutoff] ?? addDays(cutoff, card.dueDays ?? DEFAULT_DUE_DAYS);

/** One dated change to what a card owes. `amount` > 0 adds to the debt. */
export interface CardMove {
  date: IsoDate;
  amount: Minor;
  /** A bill payment (a transfer into the card). Payments settle the statement; refunds do not. */
  payment: boolean;
  /** The Ledger item it came from, so the per-card view can list it. */
  item: LedgerItem;
}

/** Everything that changed what the card owes, in the card's currency. Unconvertible amounts are counted in `skipped`. */
export function cardMoves(card: Pick<Account, "id" | "currency">, items: LedgerItem[]): { moves: CardMove[]; skipped: number } {
  const moves: CardMove[] = [];
  let skipped = 0;
  for (const it of items) {
    const x = it.type === "entry" ? it.entry : it.occ;
    const payment = x.kind === "transfer" && "toAccountId" in x && x.toAccountId === card.id;
    for (const f of cashFlow(it)) {
      if (f.accountId !== card.id) continue;
      const v = f.currency === card.currency ? f.amount : toBase({ amount: f.amount, currency: f.currency, rate: f.rate }, card.currency);
      if (v === undefined) skipped++;
      else moves.push({ date: it.date, amount: -v, payment, item: it });
    }
  }
  return { moves, skipped };
}

/** One installment plan holding part of a card's limit: its payments still to come after today. */
export interface CardHold {
  ruleId: string;
  /** The plan's note ("iPhone 18 Pro Max"), else its category. */
  name: string;
  amount: Minor;
  /** Payments still to come. */
  left: number;
  /** Payments already charged (up to today), the plan's length, and the next payment. */
  done: number;
  count?: number;
  next: IsoDate;
  each: Minor;
}

/** Installment plans billed to this card, with what each still holds. Recurring payments never hold the limit. */
export function cardHolds(card: Pick<Account, "id" | "currency">, rules: Rule[], today: IsoDate): { holds: CardHold[]; skipped: number } {
  const holds: CardHold[] = [];
  let skipped = 0;
  for (const r of rules) {
    if (r.type !== "installment" || r.kind !== "expense") continue;
    let amount = 0;
    let left = 0;
    let next: { date: IsoDate; amount: Minor } | undefined;
    for (const o of occurrences(r, addDays(today, 1), "9999-12-31")) {
      if (o.accountId !== card.id || (o.split && o.split.paidBy !== "me")) continue;
      if (o.currency !== card.currency) skipped++; // rules carry no rate
      else {
        amount += o.amount;
        left++;
        next ??= o;
      }
    }
    if (left && next) {
      const done = occurrences(r, r.start, today).length;
      holds.push({ ruleId: r.id, name: r.note?.trim() || r.category || "Installment", amount, left, done, count: r.count, next: next.date, each: next.amount });
    }
  }
  return { holds, skipped };
}

export interface CardStatus {
  /** The last statement's cut-off and due date. */
  cutoff: IsoDate;
  due: IsoDate;
  /** What that statement asked for (0 when nothing was owed). */
  statement: Minor;
  /** What is still to pay on it after the payments made since the cut-off. */
  remaining: Minor;
  paid: boolean;
  /** Charges minus refunds since the cut-off (lowered by any overpayment). */
  unbilled: Minor;
  /** Installment payments on this card that have not happened yet. They hold the limit. */
  futureInstallments: Minor;
  /** The same, per plan; adds up to `futureInstallments`. */
  holds: CardHold[];
  /** limit - (remaining + unbilled + futureInstallments); undefined when there is no limit. */
  creditLeft?: Minor;
  skipped: number;
}

/**
 * The card as of `today`. `items` are everything up to today (itemsToDate); `rules` give the
 * installment payments still to come. The opening balance (negative = owed when the card was
 * added) lands on the first statement.
 */
export function cardStatus(card: Account, items: LedgerItem[], rules: Rule[], today: IsoDate): CardStatus {
  const found = cardMoves(card, items.filter((it) => it.date <= today));
  const { moves } = found;
  let skipped = found.skipped;
  const opening = -card.openingBalance;
  const cutoff = lastCutoff(card, today);
  const owedAt = (d: IsoDate) => moves.reduce((n, m) => (m.date <= d ? n + m.amount : n), opening);
  const statement = Math.max(0, owedAt(cutoff));
  const paidSince = -moves.reduce((n, m) => (m.payment && m.date > cutoff ? n + m.amount : n), 0);
  const remaining = Math.max(0, statement - paidSince);
  const unbilled = owedAt(today) - remaining;

  const held = cardHolds(card, rules, today);
  skipped += held.skipped;
  const futureInstallments = held.holds.reduce((n, h) => n + h.amount, 0);
  const creditLeft = card.limit === undefined ? undefined : card.limit - (remaining + unbilled + futureInstallments);
  return { cutoff, due: dueFor(card, cutoff), statement, remaining, paid: statement > 0 && remaining === 0, unbilled, futureInstallments, holds: held.holds, creditLeft, skipped };
}

/** One line in the per-card view. Lines are signed like the card's debt: charges +, payments and refunds -. */
export interface CardLine {
  /** start: owed when the card was added; carried: what was owed at the previous cut-off; credit: a negative
   *  balance at this cut-off, carried to the next bill; ahead: paid more than the statement. */
  kind: "start" | "carried" | "charge" | "refund" | "payment" | "credit" | "ahead";
  amount: Minor;
  date?: IsoDate;
  item?: LedgerItem;
}

export interface CardBreakdown {
  cutoff: IsoDate;
  /** The previous cut-off (the start of this statement's cycle). */
  prev: IsoDate;
  /** Adds up to what was owed at the cut-off; the statement is that, or 0 when it is below 0. */
  statement: CardLine[];
  /** Payments made after the cut-off (negative); the statement plus these is what is left to pay, floored at 0. */
  paidSince: CardLine[];
  /** Adds up to exactly `cardStatus(...).unbilled`. */
  unbilled: CardLine[];
}

const sum = (lines: CardLine[]) => lines.reduce((n, l) => n + l.amount, 0);
const lineOf = (m: CardMove): CardLine => ({ kind: m.payment ? "payment" : m.amount < 0 ? "refund" : "charge", amount: m.amount, date: m.date, item: m.item });

/** What makes up each number on the card tile, line by line, from the same moves `cardStatus` uses. */
export function cardBreakdown(card: Account, items: LedgerItem[], today: IsoDate): CardBreakdown {
  // Oldest first, like a bank statement (items come newest first; reverse, then a stable sort by date).
  const moves = cardMoves(card, items.filter((it) => it.date <= today)).moves.reverse().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cutoff = lastCutoff(card, today);
  const prev = prevCutoff(card, cutoff);
  const opening = -card.openingBalance;
  const before = moves.filter((m) => m.date <= prev);
  const carried = before.reduce((n, m) => n + m.amount, opening);

  const statement: CardLine[] = [];
  if (before.length) statement.push({ kind: "carried", amount: carried, date: prev });
  else if (opening) statement.push({ kind: "start", amount: opening });
  statement.push(...moves.filter((m) => m.date > prev && m.date <= cutoff).map(lineOf));

  const after = moves.filter((m) => m.date > cutoff);
  const paidSince = after.filter((m) => m.payment).map(lineOf);
  const owedAtCutoff = sum(statement);
  const st = Math.max(0, owedAtCutoff);
  const paid = -sum(paidSince);
  const unbilled = after.filter((m) => !m.payment).map(lineOf);
  if (owedAtCutoff < 0) unbilled.unshift({ kind: "credit", amount: owedAtCutoff, date: cutoff });
  if (paid > st) unbilled.push({ kind: "ahead", amount: st - paid });
  return { cutoff, prev, statement, paidSince, unbilled };
}
