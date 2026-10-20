/**
 * The category chips to show: the list in its own order (Settings, or the fixed income list), then the
 * current category at the end when it is not in the list (a salary entry, a refund, a removed category),
 * so editing never shows a different category than the one stored. Matching is exact, as the old select was.
 */
export function categoryChips(list: readonly string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : [...list];
}
