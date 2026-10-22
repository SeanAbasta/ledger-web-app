import { toBase } from "./base";
import { billDate, cardStatus, cutoffFor, dueFor } from "./cards";
import { addDays } from "./dates";
import { cardBills, type CardBill } from "./forecast";
import { ledgerItems, occurrences, type Occurrence } from "./rules";
import { isCard, type Account, type Entry, type IsoDate, type Minor, type Rule } from "./schema";
import { myShare } from "./splits";

/**
 * Coming up, Soon: what leaves the bank in the next 30 days, sorted by how it gets there. Nothing here is
 * a second calculation: card bills come from the forecast's own cardBills, and the rest follows the
 * forecast's obligations (plan payments and future-dated expenses not on a card, at my share).
 * - A charge on a card is not cash: it is listed under Scheduled charges with the bill it lands on, and
 *   only that bill counts toward the total (R1).
 * - Bills in 30 days = unpaid card bills due in the window + payments from a bank in the window (R2).
 * - A paid statement is in no total; it shows as Paid until its due date passes (R3). An unpaid one past
 *   its due date is due tomorrow, as the forecast assumes.
 * - Anything dated today or earlier is a Ledger item, not scheduled (R4).
 * - A bill is an estimate until its cut-off has passed (R5).
 */
export interface BillRow {
  kind: "bill";
  key: string;
  cardId: string;
  date: IsoDate;
  due: IsoDate;
  amount: Minor;
  /** Its cut-off has not passed: charged so far plus scheduled. */
  estimate: boolean;
  /** The statement was due on or before today and is still unpaid (shown as due now, tomorrow). */
  overdue: boolean;
}

/** A plan payment or future-dated expense that comes straight out of a bank account (or no account). */
export interface PayRow {
  kind: "pay";
  key: string;
  date: IsoDate;
  label: string;
  category?: string;
  accountId?: string;
  /** The full price, in its own currency. */
  amount: Minor;
  currency: string;
  /** My share in the base currency (what counts); undefined when a foreign amount has no rate. */
  yours?: Minor;
  split: boolean;
  occ?: Occurrence;
  entry?: Entry;
}

/** A scheduled charge on a card: shown for information, never added to the total. */
export interface ChargeRow {
  kind: "charge";
  key: string;
  date: IsoDate;
  label: string;
  category?: string;
  cardId: string;
  amount: Minor;
  currency: string;
  yours?: Minor;
  split: boolean;
  /** The due date of the bill that will carry it. */
  billDue: IsoDate;
  occ?: Occurrence;
  entry?: Entry;
}

export interface PaidBill { cardId: string; amount: Minor; due: IsoDate }

export interface ComingUp {
  /** The last day of the window (today + 30). */
  until: IsoDate;
  /** Bills to pay inside the window, soonest first: card bills and bank payments. */
  bills: (BillRow | PayRow)[];
  /** Scheduled card charges inside the window, soonest first. */
  charges: ChargeRow[];
  /** Statements already paid whose due date has not passed. */
  paid: PaidBill[];
  /** Bills in 30 days: the card bills plus my share of the bank payments in `bills`. */
  total: Minor;
  /** The first card bill due after the window. */
  next?: BillRow;
  /** Every card bill up to the horizon (for checks against the forecast). */
  cardBills: BillRow[];
  /** Bank payments in the window with a foreign amount and no rate: left out of the total. */
  unconverted: number;
}

const DAYS = 30;

export function comingUp(opts: { today: IsoDate; base: string; entries: Entry[]; rules: Rule[]; accounts: Account[]; days?: number; horizon?: IsoDate }): ComingUp {
  const { today, base, rules } = opts;
  const entries = opts.entries.filter((e) => !e.deleted);
  const until = addDays(today, opts.days ?? DAYS);
  // Far enough that the first bill after the window is whole (its cut-off is inside the horizon).
  const horizon = opts.horizon && opts.horizon > until ? opts.horizon : addDays(until, 92);
  const cards = opts.accounts.filter(isCard);
  const cardOf = (id?: string) => cards.find((c) => c.id === id);
  const yoursOf = (x: { amount: Minor; currency: string; split?: Entry["split"]; rate?: string }) => toBase({ amount: myShare(x.amount, x.split), currency: x.currency, rate: x.rate }, base);

  // Card bills, from the forecast's own function. Whether a statement is overdue comes from cardStatus.
  const past = ledgerItems(entries, rules, "0000-01-01", today);
  const status = new Map(cards.map((c) => [c.id, cardStatus(c, past, rules, today)]));
  const toRow = (b: CardBill): BillRow => {
    const st = status.get(b.cardId)!;
    return { kind: "bill", key: `${b.cardId}@${b.cutoff}`, cardId: b.cardId, date: b.due, due: b.due, amount: b.amount, estimate: b.cutoff > today, overdue: b.cutoff === st.cutoff && st.due <= today };
  };
  const all = cardBills(cards, entries, rules, today, horizon, base).map(toRow).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  const paid: PaidBill[] = cards.flatMap((c) => {
    const st = status.get(c.id)!;
    return st.statement > 0 && st.remaining === 0 && st.due >= today ? [{ cardId: c.id, amount: st.statement, due: st.due }] : [];
  });

  // Plan payments and future-dated expenses after today, inside the window: on a card they are charges,
  // otherwise they are paid from the bank on their own date.
  const pays: PayRow[] = [];
  const charges: ChargeRow[] = [];
  let unconverted = 0;
  const place = (x: { key: string; date: IsoDate; label: string; category?: string; accountId?: string; amount: Minor; currency: string; split?: Entry["split"]; rate?: string; nextBill?: boolean; occ?: Occurrence; entry?: Entry }) => {
    const yours = yoursOf(x);
    const card = cardOf(x.accountId);
    const common = { key: x.key, date: x.date, label: x.label, category: x.category, amount: x.amount, currency: x.currency, yours, split: !!x.split, occ: x.occ, entry: x.entry };
    if (card) charges.push({ ...common, kind: "charge", cardId: card.id, billDue: dueFor(card, cutoffFor(card, billDate(card, x.date, x.nextBill))) });
    else {
      if (yours === undefined) unconverted++;
      pays.push({ ...common, kind: "pay", accountId: x.accountId });
    }
  };
  for (const r of rules) {
    for (const o of occurrences(r, addDays(today, 1), until)) {
      if (o.kind !== "expense") continue;
      place({ key: `${o.ruleId}@${o.date}`, date: o.date, label: o.note || o.category || "Payment", category: o.category, accountId: o.accountId, amount: o.amount, currency: o.currency, split: o.split, occ: o });
    }
  }
  for (const e of entries) {
    if (e.kind !== "expense" || e.date <= today || e.date > until) continue;
    place({ key: e.id, date: e.date, label: e.note || e.category || "Expense", category: e.category, accountId: e.accountId, amount: e.amount, currency: e.currency, split: e.split, rate: e.rate, nextBill: e.nextBill, entry: e });
  }

  const inWindow = all.filter((b) => b.due > today && b.due <= until);
  const bills = [...inWindow, ...pays].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  charges.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const total = inWindow.reduce((a, b) => a + b.amount, 0) + pays.reduce((a, p) => a + (p.yours ?? 0), 0);
  return { until, bills, charges, paid, total, next: all.find((b) => b.due > until), cardBills: all, unconverted };
}
