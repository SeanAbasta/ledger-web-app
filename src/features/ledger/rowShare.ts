import { formatMinor } from "../../data/money";
import type { LedgerItem } from "../../data/rules";
import { myShare } from "../../data/splits";

/**
 * The small third line on a split Ledger row: what it cost me ("yours ₱1,500.00"), in the entry's own
 * currency. Undefined when the row is not split. Day totals stay the full amount paid.
 */
export function shareLine(it: LedgerItem): string | undefined {
  const x = it.type === "entry" ? it.entry : it.occ;
  if (!x.split) return undefined;
  return `yours ${formatMinor(myShare(x.amount, x.split), x.currency)}`;
}
