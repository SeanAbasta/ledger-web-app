import { labelShort } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Frequency, Minor, SplitMode } from "../../data/schema";
import type { SplitFormState } from "../../data/splitForm";

/**
 * What the Add tab's forms keep and clear after a new item is saved, so several can be logged in a row
 * without leaving Add. Account and category (expense, income) or From and To (transfer) stay; the rest
 * goes back to how a fresh form starts, with the date back to today.
 */
export interface ExpenseFields {
  form: "expense";
  amount: string;
  note: string;
  date: string;
  accountId: string;
  category: string;
  type: "one-off" | "recurring" | "installment";
  freq: Frequency;
  count: string;
  end: string;
  nextBill: boolean;
  split: boolean;
  names: string;
  newName: string;
  mode: SplitMode;
  paidBy: string;
  custom: Record<string, string>;
  kept: SplitFormState["kept"];
}
export interface IncomeFields { form: "income"; amount: string; note: string; date: string; accountId: string; category: string }
export interface TransferFields { form: "transfer"; amount: string; note: string; date: string; from: string; to: string }
export type AddFields = ExpenseFields | IncomeFields | TransferFields;

export function afterSave<F extends AddFields>(f: F, today: string): F {
  const common = { amount: "", note: "", date: today };
  if (f.form !== "expense") return { ...f, ...common };
  return {
    ...f,
    ...common,
    type: "one-off",
    freq: "monthly",
    count: "12",
    end: "",
    nextBill: false,
    split: false,
    names: "",
    newName: "",
    mode: "half",
    paidBy: "me",
    custom: {},
    kept: [],
  };
}

/** The line shown at the top of the Add card: "Saved: Coffee ₱250.00", or "Saved for Oct 25: ..." when not today. */
export function savedLine(s: { note?: string; category?: string; amount: Minor; currency: string; date: string; today: string }): string {
  const what = s.note?.trim() || s.category || "Item";
  const when = s.date === s.today ? "Saved" : `Saved for ${labelShort(s.date)}`;
  return `${when}: ${what} ${formatMinor(s.amount, s.currency)}`;
}

/** Only a recurring or installment plan whose first payment is after today still opens the Ledger (it is easy to lose). */
export function opensLedger(type: ExpenseFields["type"], start: string, today: string): boolean {
  return type !== "one-off" && start > today;
}
