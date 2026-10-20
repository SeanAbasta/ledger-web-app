import { addDays } from "../../data/dates";
import type { LedgerItem } from "../../data/rules";
import type { Entry, Rule } from "../../data/schema";

/**
 * The range "Search all months" looks through: from the first entry or plan start to 30 days from today
 * (the same horizon as Next 30 days), or to the latest entry when one is dated later. A plan with no end
 * stops at that horizon. Undefined when there is nothing at all.
 */
export function allTimeRange(entries: readonly Entry[], rules: readonly Rule[], today: string): [string, string] | undefined {
  const dates = [...entries.filter((e) => !e.deleted).map((e) => e.date), ...rules.filter((r) => !r.deleted).map((r) => r.start)];
  if (dates.length === 0) return undefined;
  const latest = entries.filter((e) => !e.deleted).reduce((m, e) => (e.date > m ? e.date : m), addDays(today, 30));
  return [dates.reduce((m, d) => (d < m ? d : m)), latest];
}

/** Items (already newest first) as [day, items] in the same order: the Ledger's day groups. */
export function groupByDay(items: readonly LedgerItem[]): [string, LedgerItem[]][] {
  const g = new Map<string, LedgerItem[]>();
  for (const it of items) g.set(it.date, [...(g.get(it.date) ?? []), it]);
  return [...g.entries()];
}

/** Day groups under month headings ("2026-08"), newest month first, for the all-months results. */
export function groupByMonth(items: readonly LedgerItem[]): [string, [string, LedgerItem[]][]][] {
  const g = new Map<string, LedgerItem[]>();
  for (const it of items) g.set(it.date.slice(0, 7), [...(g.get(it.date.slice(0, 7)) ?? []), it]);
  return [...g.entries()].map(([m, its]) => [m, groupByDay(its)]);
}
