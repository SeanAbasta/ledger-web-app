import { labelMonth } from "../../data/dates";

/**
 * The grey line above the card tiles. Cards, Accounts, Owed and End of month are always today's
 * numbers; the line says so whenever the spending above them is filtered or shows another month.
 * `from` is the loaded month's first day, `filterName` the loaded filter's name (none when not filtered).
 */
export function balanceNote(from: string, today: string, filterName?: string): string | undefined {
  const other = from.slice(0, 7) !== today.slice(0, 7);
  const month = labelMonth(from);
  if (filterName && other) return `Filtered to ${filterName} in ${month}. Cards, accounts and owed below show everything, as of today.`;
  if (filterName) return `Filtered to ${filterName}. Cards, accounts and owed below show everything.`;
  if (other) return `Showing ${month}. Cards, accounts and owed below show today.`;
  return undefined;
}
