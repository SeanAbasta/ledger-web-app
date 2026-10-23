import type { Occurrence } from "../../data/rules";

/**
 * The Coming up pointer (once the Next 30 days card) shows only on the period that holds today, when it
 * has anything, and never while Search or a category filter is active.
 */
export const cardVisible = (listHasToday: boolean, due: readonly Occurrence[], filtered: boolean): boolean => listHasToday && due.length > 0 && !filtered;
