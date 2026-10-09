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
      else moves.push({ date: it.date, amount: -v, payment });
    }
  }
  return { moves, skipped };
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

  let futureInstallments = 0;
  for (const r of rules) {
    if (r.type !== "installment" || r.kind !== "expense") continue;
    for (const o of occurrences(r, addDays(today, 1), "9999-12-31")) {
      if (o.accountId !== card.id || (o.split && o.split.paidBy !== "me")) continue;
      if (o.currency !== card.currency) skipped++; // rules carry no rate
      else futureInstallments += o.amount;
    }
  }
  const creditLeft = card.limit === undefined ? undefined : card.limit - (remaining + unbilled + futureInstallments);
  return { cutoff, due: dueFor(card, cutoff), statement, remaining, paid: statement > 0 && remaining === 0, unbilled, futureInstallments, creditLeft, skipped };
}
