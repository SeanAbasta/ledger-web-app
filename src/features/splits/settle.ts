import { formatMinor } from "../../data/money";
import type { Minor } from "../../data/schema";

/**
 * Settle up, Part of it: what is left after `typed` is paid against `balance` (positive: they owe me;
 * negative: I owe them), as the preview line, or why it cannot be recorded. Capped at the balance, so an
 * over payment is refused with the most that can be recorded.
 */
export function partCheck(balance: Minor, typed: Minor | null, currency: string, name: string): { remaining: Minor; line: string } | { error: string } {
  if (!typed) return { error: "Enter an amount" };
  const most = Math.abs(balance);
  const theyOwe = balance > 0;
  if (typed > most) return { error: `That is more than ${theyOwe ? `${name} owes` : `you owe ${name}`}. The most you can record is ${formatMinor(most, currency)}.` };
  const remaining = most - typed;
  if (!remaining) return { remaining, line: "That settles it." };
  return { remaining, line: theyOwe ? `${name} will still owe you ${formatMinor(remaining, currency)}` : `You will still owe ${name} ${formatMinor(remaining, currency)}` };
}
