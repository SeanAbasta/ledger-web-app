import type { ExpenseFields, IncomeFields, TransferFields } from "./afterSave";

/**
 * A form's values as they were when saved, so Undo of Save can put them back. Nothing is stored:
 * it lives in the shell until the next save or Undo.
 */
export type ExpenseDraft = Omit<ExpenseFields, "form"> & { currency: string; rate: string };
export type IncomeDraft = Omit<IncomeFields, "form">;
export type TransferDraft = Omit<TransferFields, "form">;
export type Draft = { kind: "Expense"; fields: ExpenseDraft } | { kind: "Income"; fields: IncomeDraft } | { kind: "Transfer"; fields: TransferDraft };
