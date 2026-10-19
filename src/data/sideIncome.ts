// One-off income from other sources (a gift, interest, selling something). Not salary: income.ts treats an
// income entry in category "Salary" as the month's salary and can fold it into the salary plan, so "Salary"
// is never offered here. The categories are fixed in code; nothing new is stored.
import type { NewEntry } from "./months";
import { isCard, type Account, type Entry, type IsoDate, type Minor } from "./schema";

export const SIDE_INCOME = ["Gift", "Interest", "Sale", "Side Job", "Spare Change", "Other"] as const;

/** Which form edits an entry: the income form for one-off income in a side-income category, else the expense form
 *  (expenses, salary entries, refunds, and income in any other category stay exactly as before). */
export function incomeEditor(e: Pick<Entry, "kind" | "refund" | "category">): "income" | "add" {
  return e.kind === "income" && !e.refund && (SIDE_INCOME as readonly string[]).includes(e.category ?? "") ? "income" : "add";
}

/** Accounts income can be paid into: live bank accounts only, never cards. */
export const incomeAccounts = <A extends Account & { deleted?: true }>(accounts: A[]): A[] => accounts.filter((a) => !a.deleted && !isCard(a));

/**
 * The entry the income form saves. The currency is the account's (with its rate for a foreign account, so
 * totals can convert it); with no account it is the base currency.
 */
export function newIncome(input: { amount: Minor; category: string; note?: string; date: IsoDate; account?: Account; base: string }): NewEntry {
  const { amount, category, note, date, account, base } = input;
  if (!(SIDE_INCOME as readonly string[]).includes(category)) throw new Error("Pick a category");
  if (account && isCard(account)) throw new Error("Income goes into a bank account");
  const currency = account?.currency ?? base;
  return {
    kind: "income",
    amount,
    currency,
    category,
    note: note?.trim() || undefined,
    date,
    accountId: account?.id,
    rate: currency !== base ? account?.rate : undefined,
  };
}
