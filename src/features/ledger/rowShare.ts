import { formatMinor } from "../../data/money";
import type { LedgerItem } from "../../data/rules";
import { myShare } from "../../data/splits";
import { summarize, type EntryIndex } from "../../data/summary";

/**
 * The small third line on a split Ledger row: what it cost me ("yours ₱1,500.00"), in the entry's own
 * currency. Undefined when the row is not split. Day totals stay the full amount paid.
 */
export function shareLine(it: LedgerItem): string | undefined {
  const x = it.type === "entry" ? it.entry : it.occ;
  if (!x.split) return undefined;
  return `yours ${formatMinor(myShare(x.amount, x.split), x.currency)}`;
}

/**
 * A Ledger day head's "yours": what that day's spending cost me in the base currency, worked out by the
 * Dashboard's own `summarize` (my share of splits, refunds at my share, income and transfers left out),
 * so the two screens show the same figure for a day. `all` finds the purchase a refund belongs to.
 */
export function dayShare(its: LedgerItem[], base: string, all: EntryIndex): number {
  const d = its[0]?.date ?? "";
  return summarize(its, base, d, d, all).total;
}
