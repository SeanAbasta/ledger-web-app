import { toBase } from "./base";
import { convertMinor } from "./money";
import type { LedgerItem } from "./rules";
import type { Account, Minor } from "./schema";

export interface AccountBalance {
  account: Account;
  balance: Minor; // in the account's currency
}

export interface Balances {
  accounts: AccountBalance[];
  /** Money moved with no account (base currency). */
  unassigned: Minor;
  /** Everything in the base currency; undefined parts are excluded and counted in `skipped`. */
  totalBase: Minor;
  /** Amounts that could not be converted and were left out. */
  skipped: number;
}

/** Signed effect of an item on my cash, in its own currency. Undefined = no cash moved. */
export function cashFlow(it: LedgerItem): { amount: Minor; currency: string; rate?: string; accountId?: string } | undefined {
  const x = it.type === "entry" ? it.entry : it.occ;
  const rate = "rate" in x ? x.rate : undefined;
  const base = { currency: x.currency, rate, accountId: x.accountId };
  if (x.kind === "income") return { ...base, amount: x.amount };
  if (x.kind === "settlement") return { ...base, amount: "direction" in x && x.direction === "in" ? x.amount : -x.amount };
  // Expense: I only pay out of my own pocket when I paid, or it was not split.
  if (x.split && x.split.paidBy !== "me") return undefined;
  return { ...base, amount: -x.amount };
}

export function accountBalances(accounts: Account[], items: LedgerItem[], base: string): Balances {
  const bal = new Map<string, Minor>(accounts.map((a) => [a.id, a.openingBalance]));
  let unassigned = 0;
  let skipped = 0;
  for (const it of items) {
    const f = cashFlow(it);
    if (!f) continue;
    const acc = f.accountId ? accounts.find((a) => a.id === f.accountId) : undefined;
    if (acc) {
      if (f.currency === acc.currency) bal.set(acc.id, bal.get(acc.id)! + f.amount);
      else if (acc.currency === base) {
        const b = toBase({ amount: f.amount, currency: f.currency, rate: f.rate }, base);
        if (b === undefined) skipped++;
        else bal.set(acc.id, bal.get(acc.id)! + b);
      } else skipped++;
    } else {
      const b = toBase({ amount: f.amount, currency: f.currency, rate: f.rate }, base);
      if (b === undefined) skipped++;
      else unassigned += b;
    }
  }
  const list = accounts.map((account) => ({ account, balance: bal.get(account.id)! }));
  let totalBase = unassigned;
  for (const { account, balance } of list) {
    if (account.currency === base) totalBase += balance;
    else if (account.rate) totalBase += convertMinor(balance, account.rate, account.currency, base);
    else skipped++;
  }
  return { accounts: list, unassigned, totalBase, skipped };
}
