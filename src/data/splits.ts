import { splitEvenly } from "./money";
import type { Minor, Split, SplitMode, SplitShare } from "./schema";

/** What an expense actually costs me: my part of a split, or the whole amount when not split. */
export function myShare(amount: Minor, split?: Split): Minor {
  if (!split) return amount;
  if (split.paidBy === "me") return amount - split.shares.reduce((a, s) => a + s.amount, 0);
  return split.shares.find((s) => s.personId === "me")?.amount ?? 0;
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
