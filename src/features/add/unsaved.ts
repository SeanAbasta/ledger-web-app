import type { Draft, ExpenseDraft, IncomeDraft, TransferDraft } from "./draft";

/**
 * What was typed on the Add tab and not saved, kept while another room is open so nothing is lost on
 * the way to look something up. One slot for each kind of entry, and which one was edited last. Nothing
 * is stored: it lives until the page is reloaded or the entry is saved (a saved form is blank again).
 */
export interface Unsaved {
  last?: Draft["kind"];
  drafts: { Expense?: ExpenseDraft; Income?: IncomeDraft; Transfer?: TransferDraft };
}

export const noUnsaved = (): Unsaved => ({ drafts: {} });

/** A form is untouched until it holds an amount or a note: defaults alone are not worth keeping. */
export const isBlank = (f: { amount: string; note: string }) => !f.amount.trim() && !f.note.trim();

/** The Add tab reports a form's values (or undefined once it is blank again). */
export function keep(u: Unsaved, d: Draft | { kind: Draft["kind"]; fields: undefined }): Unsaved {
  const drafts = { ...u.drafts, [d.kind]: d.fields };
  const last = d.fields ? d.kind : u.last === d.kind ? (["Expense", "Income", "Transfer"] as const).find((k) => drafts[k]) : u.last;
  return { last, drafts };
}

/** What the Add tab starts with: the kind edited last, and its values. */
export function resume(u: Unsaved): Draft | undefined {
  const kind = u.last;
  if (!kind) return undefined;
  const fields = u.drafts[kind];
  return fields ? ({ kind, fields } as Draft) : undefined;
}

/** The values for one kind, when the person switches to it. */
export function draftOf(u: Unsaved, kind: Draft["kind"]): Draft | undefined {
  const fields = u.drafts[kind];
  return fields ? ({ kind, fields } as Draft) : undefined;
}
