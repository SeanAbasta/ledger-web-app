// Moving money between my own bank accounts. A transfer is never spending or income; it lowers one account
// and raises the other by the same amount, so the cash total does not change. Paying a card stays on the
// Dashboard's Pay button, and transfers between currencies are not supported.
import { shapeProblem, type NewEntry } from "./months";
import { isCard, type Account, type IsoDate, type Minor } from "./schema";

type Acct = Account & { deleted?: true };
const banks = (accounts: Acct[]) => accounts.filter((a) => !a.deleted && !isCard(a));

/** Bank accounts a transfer can go to from `fromId`: the other live banks in the same currency. */
export function transferTargets(accounts: Acct[], fromId: string): Acct[] {
  const from = accounts.find((a) => a.id === fromId);
  return from ? banks(accounts).filter((a) => a.id !== fromId && a.currency === from.currency) : [];
}

/** Bank accounts a transfer can start from: live banks that have another live bank in the same currency. */
export const transferSources = (accounts: Acct[]): Acct[] => banks(accounts).filter((a) => transferTargets(accounts, a.id).length > 0);

/** The entry a new transfer saves, in the From account's currency. Throws when the two accounts do not fit. */
export function newTransfer(input: { amount: Minor; from?: Account; to?: Account; date: IsoDate; note?: string }): NewEntry {
  const { amount, from, to, date, note } = input;
  if (!from || !to) throw new Error("Pick both accounts");
  if (isCard(from) || isCard(to)) throw new Error("Transfers are between bank accounts. Pay a card from its tile on Dashboard");
  if (from.currency !== to.currency) throw new Error("Both accounts need the same currency");
  const e: NewEntry = { kind: "transfer", category: "Transfer", amount, currency: from.currency, date, note: note?.trim() || undefined, accountId: from.id, toAccountId: to.id };
  const problem = shapeProblem(e);
  if (problem) throw new Error(problem);
  return e;
}
