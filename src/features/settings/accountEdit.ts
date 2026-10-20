import { parseMinor } from "../../data/money";
import type { Account } from "../../data/schema";

/**
 * What a Settings account or card row saves when a field is left. Built from the fields as typed (never
 * from the stored account alone), so tapping a card colour right after typing a name keeps the name.
 * Returns the account to save, an error, or undefined when nothing differs from the stored account,
 * so leaving a field without changing it writes nothing and nothing syncs.
 */
export type EditResult = { account: Account } | { error: string } | undefined;

export interface AccountFields { name: string; currency: string; opening: string; rate: string }
export interface CardFields { name: string; day: string; dueDays: string; limit: string; owed: string }

/** The same account? Keys holding undefined count as missing, and -0 is 0 (as in the synced file). */
export function sameAccount(x: Account, y: Account): boolean {
  const canon = (o: Account) => JSON.stringify(Object.entries(o).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)));
  return canon(x) === canon(y);
}

const changedFrom = (a: Account, next: Account): EditResult => (sameAccount(a, next) ? undefined : { account: next });

/** A bank account row (the body of the old AccountRow.commit). */
export function accountEdit(a: Account, f: AccountFields, base: string): EditResult {
  const cur = f.currency;
  const neg = f.opening.trim().startsWith("-");
  const o = parseMinor(f.opening.replace("-", ""), cur);
  if (o === null) return { error: "Enter a valid balance" };
  const r = f.rate.trim();
  return changedFrom(a, { ...a, name: f.name.trim() || "Account", currency: cur, openingBalance: neg ? -o : o, rate: cur !== base && /^\d+(\.\d+)?$/.test(r) ? r : undefined });
}

const dayOk = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

/** A credit card row (the body of the old CardRow.commit); `extra` is a colour tap. Same checks, same order. */
export function cardEdit(a: Account, f: CardFields, base: string, extra: Partial<Account> = {}): EditResult {
  const d = Number(f.day);
  const dd = Number(f.dueDays);
  if (!dayOk(d, 1, 31)) return { error: "Cut-off day is 1 to 31" };
  if (!dayOk(dd, 0, 60)) return { error: "Due is 0 to 60 days after the cut-off" };
  const lim = f.limit.trim() ? parseMinor(f.limit, base) : undefined;
  if (lim === null) return { error: "Enter a valid limit" };
  const o = f.owed.trim() ? parseMinor(f.owed, base) : 0;
  if (o === null) return { error: "Enter a valid amount owed" };
  return changedFrom(a, { ...a, name: f.name.trim() || "Card", currency: base, rate: undefined, statementDay: d, dueDays: dd, limit: lim, openingBalance: o ? -o : 0, ...extra });
}
