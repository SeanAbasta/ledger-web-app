import { formatMinor } from "./money";
import type { LedgerItem } from "./rules";

const itemOf = (it: LedgerItem) => (it.type === "entry" ? it.entry : it.occ);

/** The category a Ledger item is listed under: its own, or "Other" when it has none (as the row shows it). */
export const categoryOf = (it: LedgerItem) => itemOf(it).category || "Other";

/** Search (category, note, amount, currency) and the category filter; both must match. Empty means no filter. */
export function itemMatches(it: LedgerItem, q: string, category: string): boolean {
  if (category && categoryOf(it) !== category) return false;
  if (!q.trim()) return true;
  const x = itemOf(it);
  const hay = [x.category, x.note, formatMinor(x.amount, x.currency), x.currency].join(" ").toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

/**
 * Categories to filter by: Settings categories in their order, then any others on the items in view
 * (removed categories on old entries, Card payment, Settlement, Other for uncategorised items), A to Z.
 * The selected one always stays, so moving to a period without it keeps the filter.
 */
export function categoryChoices(items: LedgerItem[], settings: string[], selected = ""): string[] {
  const extra = new Set([...items.map(categoryOf), ...(selected ? [selected] : [])]);
  for (const c of settings) extra.delete(c);
  return [...settings, ...[...extra].sort((a, b) => a.localeCompare(b))];
}
