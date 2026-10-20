import { formatMinor, parseMinor, splitEvenly } from "../../data/money";
import type { Minor, Person, Split, SplitMode } from "../../data/schema";
import { keptKey, namesOf, splitFromForm, type SplitFormState } from "../../data/splitForm";

/** The split modes that fit who paid: I paid offers They owe, someone else paid offers I owe. */
export function modesFor(paidBy: string): SplitMode[] {
  return paidBy === "me" ? ["half", "they-owe", "custom"] : ["half", "i-owe", "custom"];
}

/** The mode after Paid by changed: They owe and I owe swap when they no longer fit; Even and Custom stay. */
export function modeAfterPayer(mode: SplitMode, paidBy: string): SplitMode {
  if (paidBy === "me" && mode === "i-owe") return "they-owe";
  if (paidBy !== "me" && mode === "they-owe") return "i-owe";
  return mode;
}

export type Preview = { lines: string[] } | { error: string };

/**
 * Who owes whom, worked out live by the save path itself (`splitFromForm`), so the line is exactly what
 * Save stores. Picked names that are not saved people yet stand in as placeholders (their lower-case
 * name as id), so nothing is written. Undefined while the amount is empty or not a number.
 * An installment shows each payment's split ("each payment").
 */
export function splitPreview(form: SplitFormState, amountText: string, currency: string, people: Person[], kind: "one-off" | "recurring" | "installment", count: string, original?: { amount: Minor; split: Split }): Preview | undefined {
  const minor = parseMinor(amountText, currency);
  if (!minor) return undefined;
  const n = Number(count);
  const perPayment = kind === "installment" && Number.isInteger(n) && n >= 2 ? splitEvenly(minor, n)[0]! : minor;
  const named = namesOf(form.names).map((name) => people.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? { id: name.toLowerCase(), name, updatedAt: "" });
  let split: Split;
  try {
    split = splitFromForm(form, named, perPayment, currency, original);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check the split" };
  }
  const name = (id: string) => named.find((p) => p.id === id)?.name ?? form.kept.find((k) => k.id === id || keptKey(k.id) === id)?.name.concat(" (removed)") ?? people.find((p) => p.id === id)?.name ?? "Someone";
  const each = kind === "installment" ? " each payment" : "";
  const payer = split.paidBy === "me" ? "you" : name(split.paidBy);
  return {
    lines: split.shares.map((s) => {
      const amt = formatMinor(s.amount, currency) + each;
      if (s.personId === "me") return `You owe ${payer} ${amt}`;
      return `${name(s.personId)} owes ${payer} ${amt}`;
    }),
  };
}
