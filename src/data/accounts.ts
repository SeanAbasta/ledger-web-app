import { toBase } from "./base";
import { convertMinor } from "./money";
import type { LedgerItem } from "./rules";
import { isCard, type Account, type Minor } from "./schema";

export interface AccountBalance {
  account: Account;
  balance: Minor; // in the account's currency
}

export interface Balances {
  /** Bank accounts (cash). */
  accounts: AccountBalance[];
  /** Credit cards. A negative balance is what the card owes. Never part of `totalBase`. */
  cards: AccountBalance[];
  /** Money moved with no account (base currency). */
  unassigned: Minor;
  /** Cash (bank accounts and unassigned) in the base currency; undefined parts are excluded and counted in `skipped`. */
  totalBase: Minor;
  /** Amounts that could not be converted and were left out. */
  skipped: number;
}

export interface Flow { amount: Minor; currency: string; rate?: string; accountId?: string }

/** Signed effects of an item on my accounts, in its own currency. Empty = no money of mine moved. */
export function cashFlow(it: LedgerItem): Flow[] {
  const x = it.type === "entry" ? it.entry : it.occ;
  const rate = "rate" in x ? x.rate : undefined;
  const base = { currency: x.currency, rate, accountId: x.accountId };
  if (x.kind === "income") return [{ ...base, amount: x.amount }];
  if (x.kind === "settlement") return [{ ...base, amount: "direction" in x && x.direction === "in" ? x.amount : -x.amount }];
  // A transfer leaves one of my accounts and lands in another (paying a card from the bank).
  if (x.kind === "transfer") return [{ ...base, amount: -x.amount }, { ...base, accountId: "toAccountId" in x ? x.toAccountId : undefined, amount: x.amount }];
  // Expense: I only pay out of my own pocket when I paid, or it was not split.
  if (x.split && x.split.paidBy !== "me") return [];
  return [{ ...base, amount: -x.amount }];
}

export function accountBalances(accounts: Account[], items: LedgerItem[], base: string): Balances {
  const bal = new Map<string, Minor>(accounts.map((a) => [a.id, a.openingBalance]));
  let unassigned = 0;
  let skipped = 0;
  for (const f of items.flatMap(cashFlow)) {
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
  const all = accounts.map((account) => ({ account, balance: bal.get(account.id)! }));
  const list = all.filter((b) => !isCard(b.account));
  const cards = all.filter((b) => isCard(b.account));
  let totalBase = unassigned;
  for (const { account, balance } of list) {
    if (account.currency === base) totalBase += balance;
    else if (account.rate) totalBase += convertMinor(balance, account.rate, account.currency, base);
    else skipped++;
  }
  return { accounts: list, cards, unassigned, totalBase, skipped };
}
