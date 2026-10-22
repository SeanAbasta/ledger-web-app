/**
 * The category chips to show: the list in its own order (Settings, or the fixed income list), then the
 * current category at the end when it is not in the list (a salary entry, a refund, a removed category),
 * so editing never shows a different category than the one stored. Matching is exact, as the old select was.
 */
export function categoryChips(list: readonly string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : [...list];
}

/**
 * The Add form's short Category row: the first `n` chips in list order, with the picked one kept in view
 * (it takes the last place when it is further down, so the others never move), and how many sit behind
 * More. A list only one longer than `n` is shown whole: a More chip that hides one chip saves nothing.
 */
export function visibleChips(list: readonly string[], current: string, n = 4): { shown: string[]; more: number } {
  const all = categoryChips(list, current);
  if (all.length <= n + 1) return { shown: all, more: 0 };
  const head = all.slice(0, n);
  const shown = !current || head.includes(current) ? head : [...all.slice(0, n - 1), current];
  return { shown, more: all.length - shown.length };
}
