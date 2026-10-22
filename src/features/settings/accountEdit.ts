import { formatMinor, parseMinor } from "../../data/money";
import { DEFAULT_DUE_DAYS, type Account } from "../../data/schema";

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

/** An amount as a row shows it while editing: digits, point and minus, no currency sign or commas. */
export const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.-]/g, "");

/** A bank account row's fields as they start from the stored account. */
export const accountFieldsOf = (a: Account): AccountFields => ({ name: a.name, currency: a.currency, opening: plain(a.openingBalance, a.currency), rate: a.rate ?? "" });

/** A card row's fields as they start from the stored card. */
export const cardFieldsOf = (a: Account, base: string): CardFields => ({
  name: a.name,
  day: String(a.statementDay ?? ""),
  dueDays: String(a.dueDays ?? DEFAULT_DUE_DAYS),
  limit: a.limit !== undefined ? plain(a.limit, base) : "",
  owed: a.openingBalance ? plain(-a.openingBalance, base) : "",
});

/**
 * A row's fields after the stored account changed (a save, a pull from the other device, Restore, Move
 * before remove): every field takes the stored value except the one being typed in, which keeps what
 * is typed. The row keeps its place (keyed by id only), so focus and the phone keyboard stay.
 */
export function freshFields<F extends object>(local: F, stored: F, focused?: keyof F): F {
  return focused === undefined ? { ...stored } : { ...stored, [focused]: local[focused] };
}

/**
 * A new bank account or card, named before it is created: no more "New account" placeholders to
 * rename. Undefined while the name is blank. A card starts with the cut-off on the 15th and the usual
 * days until due, as before.
 */
export function newAccountOf(name: string, base: string, kind: "bank" | "card"): Omit<Account, "id" | "updatedAt"> | undefined {
  const n = name.trim();
  if (!n) return undefined;
  return kind === "card" ? { name: n, currency: base, openingBalance: 0, type: "card", statementDay: 15, dueDays: DEFAULT_DUE_DAYS } : { name: n, currency: base, openingBalance: 0 };
}
