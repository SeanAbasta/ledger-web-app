// Compare a card with what the bank app shows, and name the likely cause of a gap. Read-only:
// nothing here is stored, and suggestions only point at entries to look at.
import type { CardBreakdown, CardLine, CardStatus } from "./cards";
import type { LedgerItem } from "./rules";
import type { IsoDate, Minor } from "./schema";
import { myShare } from "./splits";

export type BankField = "statement" | "outstanding" | "available";
export type BankFigures = Partial<Record<BankField, Minor>>;

export type Cause =
  /** Charges on one day add up to the gap: the bank likely posted them on another statement. */
  | { kind: "posting"; date: IsoDate; lines: CardLine[] }
  /** The gap equals everything since the cut-off: the bank likely still shows it as pending. */
  | { kind: "pending"; amount: Minor }
  /** One entry equals the gap: a typo, or it belongs on (or off) this card. */
  | { kind: "entry"; item: LedgerItem; onCard: boolean }
  /** A split share on one of this card's charges equals the gap. */
  | { kind: "share"; item: LedgerItem; share: Minor }
  /** Nothing matches: likely a balance from before Ledger, interest or a fee. */
  | { kind: "unknown" };

export interface BankCheck {
  field: BankField;
  ledger: Minor;
  bank: Minor;
  /** Positive when Ledger shows more owed than the bank (for available credit: less credit). 0 = matches. */
  diff: Minor;
  causes: Cause[];
}

const itemAmount = (it: LedgerItem) => (it.type === "entry" ? it.entry : it.occ);

/**
 * `items` are everything up to today (to find an entry on another account). Only fields the bank
 * figure was typed for are checked; available credit is skipped when the card has no limit.
 */
export function reconcile(cardId: string, st: CardStatus, bd: CardBreakdown, items: LedgerItem[], bank: BankFigures): BankCheck[] {
  const out: BankCheck[] = [];
  const ledgerOf: Record<BankField, Minor | undefined> = { statement: st.statement, outstanding: st.remaining + st.unbilled, available: st.creditLeft };
  for (const field of ["statement", "outstanding", "available"] as const) {
    const b = bank[field];
    const l = ledgerOf[field];
    if (b === undefined || l === undefined) continue;
    const diff = field === "available" ? b - l : l - b;
    out.push({ field, ledger: l, bank: b, diff, causes: diff ? causesFor(field, Math.abs(diff), diff > 0, cardId, st, bd, items) : [] });
  }
  return out;
}

function causesFor(field: BankField, gap: Minor, ledgerHigher: boolean, cardId: string, st: CardStatus, bd: CardBreakdown, items: LedgerItem[]): Cause[] {
  const causes: Cause[] = [];
  // The statement is checked against its own cycle; the other figures include what came after.
  const lines = (field === "statement" ? bd.statement : [...bd.statement, ...bd.unbilled]).filter((l) => l.kind === "charge" && l.item);

  const byDay = new Map<IsoDate, CardLine[]>();
  for (const l of lines) byDay.set(l.date!, [...(byDay.get(l.date!) ?? []), l]);
  for (const [date, ls] of byDay) {
    if (ls.length > 1 && ls.reduce((n, l) => n + l.amount, 0) === gap) causes.push({ kind: "posting", date, lines: ls });
  }

  if (field !== "statement" && ledgerHigher && st.unbilled > 0 && st.unbilled === gap) causes.push({ kind: "pending", amount: gap });

  for (const l of lines) if (l.amount === gap) causes.push({ kind: "entry", item: l.item!, onCard: true });

  // The bank has more: an expense on another account in this cycle or the last may belong on this card.
  if (!ledgerHigher) {
    const from = bd.prev;
    for (const it of items) {
      const x = itemAmount(it);
      if (x.kind !== "expense" || x.accountId === cardId || it.date <= from || it.date > (field === "statement" ? bd.cutoff : "9999-12-31")) continue;
      if (x.amount === gap) causes.push({ kind: "entry", item: it, onCard: false });
    }
  }

  for (const l of lines) {
    const x = itemAmount(l.item!);
    if (!x.split) continue;
    const mine = myShare(x.amount, x.split);
    const theirs = x.amount - mine;
    if (mine === gap || theirs === gap) causes.push({ kind: "share", item: l.item!, share: gap });
  }

  return causes.length ? causes.slice(0, 4) : [{ kind: "unknown" }];
}
