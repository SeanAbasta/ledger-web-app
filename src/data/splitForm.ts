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
