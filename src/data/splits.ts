import { splitEvenly } from "./money";
import type { Entry, Minor, Person, Split, SplitMode, SplitShare } from "./schema";

/** What an expense actually costs me: my part of a split, or the whole amount when not split. */
export function myShare(amount: Minor, split?: Split): Minor {
  if (!split) return amount;
  if (split.paidBy === "me") return amount - split.shares.reduce((a, s) => a + s.amount, 0);
  return split.shares.find((s) => s.personId === "me")?.amount ?? 0;
}

/**
 * My part of a refund: the same share I had of the expense it refunds (all of it when that
 * expense was not split, or cannot be found).
 */
export function myRefund(refund: Pick<Entry, "amount" | "refundOf">, byId?: Map<string, Entry>): Minor {
  const orig = refund.refundOf ? byId?.get(refund.refundOf) : undefined;
  if (!orig?.split || orig.amount <= 0) return refund.amount;
  return Math.round((refund.amount * myShare(orig.amount, orig.split)) / orig.amount);
}

/**
 * Build the shares for a split. Shares are what each participant owes the payer.
 * - they-owe: I paid, the listed people cover the whole amount between them.
 * - i-owe:    one person paid, I owe the whole amount.
 * - half:     everyone (me + listed people) pays an equal part; the payer owes nothing.
 * - custom:   shares given directly.
 */
export function buildSplit(opts: {
  amount: Minor;
  paidBy: string; // "me" or a person id
  mode: SplitMode;
  people: string[]; // other participants (person ids)
  custom?: SplitShare[];
}): Split {
  const { amount, paidBy, mode, people, custom } = opts;
  let shares: SplitShare[];
  if (mode === "custom") {
    shares = (custom ?? []).filter((s) => s.amount > 0 && s.personId !== paidBy);
    const sum = shares.reduce((a, s) => a + s.amount, 0);
    if (sum > amount) throw new Error("Custom shares exceed the amount");
  } else if (mode === "i-owe") {
    if (paidBy === "me") throw new Error("Someone else must have paid");
    shares = [{ personId: "me", amount }];
  } else if (mode === "they-owe") {
    if (paidBy !== "me") throw new Error("You must be the payer");
    if (!people.length) throw new Error("Pick at least one person");
    shares = splitEvenly(amount, people.length).map((a, i) => ({ personId: people[i]!, amount: a }));
  } else {
    const everyone = ["me", ...people.filter((p) => p !== "me")];
    if (everyone.length < 2) throw new Error("Pick at least one person");
    const parts = splitEvenly(amount, everyone.length);
    shares = everyone.map((id, i) => ({ personId: id, amount: parts[i]! })).filter((s) => s.personId !== paidBy);
  }
  return { paidBy, mode, shares };
}

/** What to call someone in a split when even their removed record is gone. */
export const REMOVED_PERSON = "Removed person";

/** Everyone in a split other than me: the people who owe (in share order), then the payer. */
export function participants(split: Split): string[] {
  return [...new Set([...split.shares.map((s) => s.personId), split.paidBy])].filter((id) => id !== "me");
}

/**
 * People in a split who have since been removed, in split order. The name comes from the removed
 * record (tombstone); "Removed person" when even that is gone.
 */
export function removedInSplit(split: Split, live: Person[], all: Person[]): { id: string; name: string }[] {
  return participants(split)
    .filter((id) => !live.some((p) => p.id === id))
    .map((id) => ({ id, name: all.find((p) => p.id === id)?.name ?? REMOVED_PERSON }));
}

/**
 * The split to store when an entry is saved. When nothing about the split changed (amount, payer,
 * mode, who is in it and, for custom, each share), the stored split is returned exactly as it was,
 * so opening and saving an entry never moves a share. Otherwise it is rebuilt with `buildSplit`,
 * keeping the original participants' order so spare centavos go to the same people.
 */
export function splitForSave(opts: {
  original?: { amount: Minor; split: Split };
  amount: Minor;
  paidBy: string;
  mode: SplitMode;
  people: string[];
  custom?: SplitShare[];
}): Split {
  const { original, amount, paidBy, mode, people, custom } = opts;
  const others = [...new Set(people.filter((id) => id !== "me"))];
  if (original) {
    const o = original.split;
    const before = participants(o);
    const now = [...new Set([...others, ...(paidBy === "me" ? [] : [paidBy])])];
    const owed = (xs: SplitShare[]) => JSON.stringify(Object.fromEntries(xs.filter((s) => s.amount > 0 && s.personId !== paidBy).map((s) => [s.personId, s.amount]).sort()));
    const same = original.amount === amount && o.paidBy === paidBy && o.mode === mode
      && before.length === now.length && before.every((id) => now.includes(id))
      && (mode !== "custom" || owed(o.shares) === owed(custom ?? []));
    if (same) return o;
    const order = before.filter((id) => others.includes(id)).concat(others.filter((id) => !before.includes(id)));
    const rank = (s: SplitShare) => (order.includes(s.personId) ? order.indexOf(s.personId) : order.length);
    return buildSplit({ amount, paidBy, mode, people: order, custom: custom && [...custom].sort((x, y) => rank(x) - rank(y)) });
  }
  return buildSplit({ amount, paidBy, mode, people: others, custom });
}
