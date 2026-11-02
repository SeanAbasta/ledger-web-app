import type { LedgerItem } from "../../data/rules";

/**
 * The small labels on a Ledger or card-view row, in one order: split, refund, next bill, which payment of
 * a plan, upcoming. One place, so the Ledger and the card view never drift apart.
 */
export function itemTags(it: LedgerItem, opts: { upcoming?: boolean } = {}): string[] {
  const x = it.type === "entry" ? it.entry : it.occ;
  const tags: string[] = [];
  if (x.split) tags.push("split");
  if (it.type === "entry" && it.entry.refund) tags.push("refund");
  if (it.type === "entry" && it.entry.nextBill) tags.push("next bill");
  if (it.type === "occurrence") tags.push(it.occ.type === "installment" ? `${it.occ.index} of ${it.occ.count}` : "recurring");
  if (opts.upcoming) tags.push("upcoming");
  return tags;
}

/** The trip an entry was posted from, if any: its name when known, else a plain "Trip". */
export function tripTag(it: LedgerItem, names: ReadonlyMap<string, string>): string | undefined {
  if (it.type !== "entry" || !it.entry.tripId) return undefined;
  return names.get(it.entry.tripId) || "Trip";
}
