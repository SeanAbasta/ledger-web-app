import { convertMinor } from "./money";
import type { Entry, Minor } from "./schema";
import type { Occurrence } from "./rules";

/** Amount in the base currency, or undefined if a foreign amount has no rate to convert with. */
export function toBase(item: Pick<Entry, "amount" | "currency" | "rate"> | Pick<Occurrence, "amount" | "currency">, base: string): Minor | undefined {
  if (item.currency === base) return item.amount;
  const rate = "rate" in item ? item.rate : undefined;
  return rate ? convertMinor(item.amount, rate, item.currency, base) : undefined;
}
