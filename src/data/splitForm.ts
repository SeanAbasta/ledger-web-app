import { upsert } from "./collections";
import type { LedgerStore } from "./db";
import { formatMinor, parseMinor } from "./money";
import type { Minor, Person, Split, SplitMode, SplitShare } from "./schema";
import { participants, removedInSplit, splitForSave } from "./splits";

/**
 * The split part of the expense form. Live people are typed by name (`names`); people removed since
 * the entry was saved are `kept` by id and cannot be typed, so editing never drops them. `paidBy` and
 * the `custom` keys are "me", a live person's lower-case name, or "#<id>" for a kept person.
 */
export interface SplitFormState {
  names: string;
  paidBy: string;
  mode: SplitMode;
  custom: Record<string, string>;
  kept: { id: string; name: string }[];
}

export const keptKey = (id: string) => `#${id}`;

/** The picked names in order: trimmed, no empties, no duplicates without regard to case (first spelling wins). */
export function namesOf(names: string): string[] {
  const seen = new Set<string>();
  return names.split(",").map((n) => n.trim()).filter((n) => {
    const k = n.toLowerCase();
    if (!n || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const hasName = (names: string, name: string) => namesOf(names).some((n) => n.toLowerCase() === name.trim().toLowerCase());

/** Tap a person: picked people are taken out, others are added at the end. */
export function toggleName(names: string, name: string): string {
  const k = name.trim().toLowerCase();
  const now = namesOf(names);
  return (now.some((n) => n.toLowerCase() === k) ? now.filter((n) => n.toLowerCase() !== k) : [...now, name.trim()]).join(", ");
}

/**
 * Add a typed name: picked if it is not yet (never taken out), spelled as the live person when one matches.
 * An empty name, or one with a comma (it would read as two names), changes nothing.
 */
export function addName(names: string, typed: string, people: Person[]): string {
  const n = typed.trim();
  if (!n || n.includes(",") || hasName(names, n)) return namesOf(names).join(", ");
  return toggleName(names, people.find((p) => p.name.toLowerCase() === n.toLowerCase())?.name ?? n);
}

/**
 * Paid by after the picked people changed. It stays when it is me, a kept person or still picked.
 * When its person was taken out it goes back to me, except in I owe, where someone else must have paid:
 * then the first picked person, else the first kept one, else me.
 */
export function payerAfter(paidBy: string, mode: SplitMode, names: string, kept: SplitFormState["kept"]): string {
  const picked = namesOf(names).map((n) => n.toLowerCase());
  if (paidBy === "me" || kept.some((k) => keptKey(k.id) === paidBy) || picked.includes(paidBy)) return paidBy;
  return mode === "i-owe" ? firstOther(picked, kept) : "me";
}

/** Paid by after the mode changed: switching to I owe moves it off me to the first person (or first kept). */
export function payerForMode(mode: SplitMode, paidBy: string, names: string, kept: SplitFormState["kept"]): string {
  if (mode === "i-owe" && paidBy === "me") return firstOther(namesOf(names).map((n) => n.toLowerCase()), kept);
  return payerAfter(paidBy, mode, names, kept);
}

const firstOther = (picked: string[], kept: SplitFormState["kept"]) => picked[0] ?? (kept[0] ? keptKey(kept[0].id) : "me");

/** Fill the form from a stored split. `live` are current people, `all` includes removed ones. */
export function splitFormOf(split: Split, currency: string, live: Person[], all: Person[]): SplitFormState {
  const key = (id: string) => (id === "me" ? "me" : live.find((p) => p.id === id)?.name.toLowerCase() ?? keptKey(id));
  return {
    names: participants(split).map((id) => live.find((p) => p.id === id)?.name).filter(Boolean).join(", "),
    paidBy: key(split.paidBy),
    mode: split.mode,
    custom: Object.fromEntries(split.shares.map((s) => [key(s.personId), formatMinor(s.amount, currency).replace(/[^\d.]/g, "")])),
    kept: removedInSplit(split, live, all),
  };
}

/** The typed names as people, adding anyone new. Names are matched without regard to case. */
export async function resolveNames(store: LedgerStore, names: string[], people: Person[]): Promise<Person[]> {
  const out: Person[] = [];
  for (const n of names) {
    const found = [...people, ...out].find((p) => p.name.toLowerCase() === n.toLowerCase());
    out.push(found ?? (await upsert(store, "people", { name: n })));
  }
  return out;
}

/** The split to save. `named` are the typed names resolved to people; kept people always take part. */
export function splitFromForm(f: SplitFormState, named: Person[], amount: Minor, currency: string, original?: { amount: Minor; split: Split }): Split {
  const ids = new Map<string, string>([...named.map((p) => [p.name.toLowerCase(), p.id] as const), ...f.kept.map((k) => [keptKey(k.id), k.id] as const)]);
  const share = (k: string, personId: string): SplitShare => ({ personId, amount: parseMinor(f.custom[k] ?? "0", currency) ?? 0 });
  return splitForSave({
    original,
    amount,
    paidBy: f.paidBy === "me" ? "me" : ids.get(f.paidBy) ?? "me",
    mode: f.mode,
    people: [...named.map((p) => p.id), ...f.kept.map((k) => k.id)],
    custom: [...named.map((p) => share(p.name.toLowerCase(), p.id)), ...f.kept.map((k) => share(keptKey(k.id), k.id))],
  });
}
