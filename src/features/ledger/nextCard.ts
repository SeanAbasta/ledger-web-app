import type { LedgerItem, Occurrence } from "../../data/rules";

/** How many upcoming payments the "Next 30 days" card lists. */
export const NEXT_CARD_ROWS = 5;

const keyOf = (o: Pick<Occurrence, "ruleId" | "date">) => `${o.ruleId}@${o.date}`;

/**
 * The "Next 30 days" card shows only on the period that holds today, when it has anything, and never
 * while Search or a category filter is active. The card and the day list use this one flag.
 */
export const cardVisible = (listHasToday: boolean, due: readonly Occurrence[], filtered: boolean): boolean => listHasToday && due.length > 0 && !filtered;

/** The plan payments the visible card lists (its first five), so the day list can leave them out. */
export function nextCardKeys(due: readonly Occurrence[], visible: boolean): Set<string> {
  return new Set(visible ? due.slice(0, NEXT_CARD_ROWS).map(keyOf) : []);
}

/**
 * The day list without the payments already in the visible card. Entries, income, today's payment and
 * anything past the card's fifth row stay; with no keys nothing changes. These rows are all after today,
 * so day totals (which leave upcoming payments out) do not change.
 */
export function withoutCardRows(items: readonly LedgerItem[], keys: Set<string>): LedgerItem[] {
  if (keys.size === 0) return [...items];
  return items.filter((it) => it.type !== "occurrence" || !keys.has(keyOf(it.occ)));
}
