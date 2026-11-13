import { nonZero, sumBy, type Line } from "../../data/balances";

/** A person's lines add up to nothing in every currency: they are settled up. */
export const isSettled = (lines: Line[]): boolean => nonZero(sumBy(lines)).length === 0;

/**
 * People with a balance stay in view; the settled ones are tucked into their own section, so the list
 * does not grow with everyone who ever paid back. Each keeps its order.
 */
export function splitSettled<T extends { lines: Line[] }>(rows: T[]): { open: T[]; settled: T[] } {
  return { open: rows.filter((r) => !isSettled(r.lines)), settled: rows.filter((r) => isSettled(r.lines)) };
}
