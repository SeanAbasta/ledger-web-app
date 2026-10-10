// What a new item starts with: the last used account and category (when switched on), else the
// default from Settings, as long as it still exists. Nothing here guesses: with neither, the
// account stays unpicked, as before defaults existed.
import type { Account, Defaults } from "./schema";

export type DefaultKind = "expense" | "income" | "cardPayment";
export type LastUsed = Partial<Record<DefaultKind | "category", string>>;

/** The account id to start with, chosen from `allowed` (live accounts that fit), or "" for none. */
export function startAccount(kind: DefaultKind, defaults: Defaults | undefined, last: LastUsed | undefined, allowed: Account[]): string {
  const ok = (id?: string): id is string => !!id && allowed.some((a) => a.id === id);
  const l = last?.[kind];
  if (defaults?.lastUsed && ok(l)) return l;
  const d = defaults?.[kind];
  return ok(d) ? d : "";
}

/** The category to start with; falls back to the first in the list. */
export function startCategory(defaults: Defaults | undefined, last: LastUsed | undefined, categories: string[]): string {
  const ok = (c?: string): c is string => !!c && categories.includes(c);
  if (defaults?.lastUsed && ok(last?.category)) return last.category;
  return ok(defaults?.category) ? defaults.category : categories[0] ?? "";
}
