import { nonZero, personLines, sumBy, type ByCurrency } from "./balances";
import type { LedgerItem } from "./rules";
import type { Entry, Rule, Split } from "./schema";

/** What refers to a person or an account, so Settings can say what removing it affects. */
export interface Usage {
  /** Live entries that refer to it. */
  entries: number;
  /** Live recurring payments and installment plans that refer to it. */
  plans: number;
}

export interface PersonUsage extends Usage {
  /** Balance with the person up to the items given, per currency, zeros dropped. Positive: they owe me. */
  owed: ByCurrency;
}

const inSplit = (split: Split | undefined, id: string) => !!split && (split.paidBy === id || split.shares.some((s) => s.personId === id));

/** Entries and plans that split with the person or settle with them, and what they owe (from `items`). */
export function personUsage(personId: string, entries: Entry[], rules: Rule[], items: LedgerItem[]): PersonUsage {
  return {
    entries: entries.filter((e) => !e.deleted && (inSplit(e.split, personId) || (e.kind === "settlement" && e.personId === personId))).length,
    plans: rules.filter((r) => !r.deleted && inSplit(r.split, personId)).length,
    owed: Object.fromEntries(nonZero(sumBy(personLines(personId, items)))),
  };
}

/** Entries and plans that pay from or into the account (including later changes to a plan). */
export function accountUsage(accountId: string, entries: Entry[], rules: Rule[]): Usage {
  return {
    entries: entries.filter((e) => !e.deleted && (e.accountId === accountId || e.toAccountId === accountId)).length,
    plans: rules.filter((r) => !r.deleted && (r.accountId === accountId || (r.revisions ?? []).some((x) => x.accountId === accountId))).length,
  };
}

/** "4 entries and 1 plan", "1 entry", "2 plans". Empty when nothing refers to it. */
export function usageText(u: Usage): string {
  const parts = [
    u.entries ? `${u.entries} ${u.entries === 1 ? "entry" : "entries"}` : "",
    u.plans ? `${u.plans} ${u.plans === 1 ? "plan" : "plans"}` : "",
  ].filter(Boolean);
  return parts.join(" and ");
}
