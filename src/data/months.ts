import type { LedgerStore } from "./db";
import { monthKeysBetween } from "./dates";
import { monthOf, type Entry, type MonthFile, type MonthKey } from "./schema";
import { ulid } from "./ulid";

export const monthPath = (m: MonthKey) => `months/${m}.json`;
const now = () => new Date().toISOString();

export type NewEntry = Omit<Entry, "id" | "createdAt" | "updatedAt" | "deleted">;

function validate(e: NewEntry) {
  if (!Number.isInteger(e.amount) || e.amount <= 0) throw new Error("Amount must be a positive integer in minor units");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error("Date must be YYYY-MM-DD");
  if (!e.currency) throw new Error("Currency required");
  const problem = shapeProblem(e);
  if (problem) throw new Error(problem);
}

/** Rules that depend on the kind. Shared with the import check, so both say the same thing. */
export function shapeProblem(e: Pick<Entry, "kind" | "accountId" | "toAccountId" | "split" | "refund" | "refundOf">): string | undefined {
  if (e.kind === "transfer") {
    if (!e.accountId || !e.toAccountId) return "A transfer needs a from and a to account";
    if (e.accountId === e.toAccountId) return "A transfer needs two different accounts";
    if (e.split) return "A transfer cannot be split";
  } else if (e.toAccountId !== undefined) return "Only a transfer has a to account";
  if (e.refund !== undefined || e.refundOf !== undefined) {
    if (e.kind !== "income") return "Only income can be a refund";
    if (e.refund !== true) return "Bad refund flag";
    if (e.split) return "A refund cannot be split";
  }
  return undefined;
}

const entriesOf = (d: { entries?: unknown } | undefined) => ((d?.entries as Entry[] | undefined) ?? []);
const file = (month: MonthKey, entries: Entry[]) => ({ month, entries }) satisfies MonthFile as unknown as Record<string, unknown>;

export async function addEntry(store: LedgerStore, input: NewEntry): Promise<Entry> {
  validate(input);
  const t = now();
  const entry: Entry = { ...input, id: ulid(), createdAt: t, updatedAt: t };
  const m = monthOf(entry.date);
  await store.transact([monthPath(m)], (docs) => {
    docs.set(monthPath(m), file(m, [...entriesOf(docs.get(monthPath(m))), entry]));
  });
  return entry;
}

/** Update an entry. `month` is where it currently lives; a changed date moves it. */
export async function updateEntry(
  store: LedgerStore,
  month: MonthKey,
  id: string,
  patch: Partial<NewEntry>,
): Promise<Entry> {
  let result: Entry | undefined;
  const target = patch.date ? monthOf(patch.date) : month;
  const paths = [...new Set([monthPath(month), monthPath(target)])];
  await store.transact(paths, (docs) => {
    const src = entriesOf(docs.get(monthPath(month)));
    const cur = src.find((e) => e.id === id && !e.deleted);
    if (!cur) throw new Error(`Entry ${id} not found in ${month}`);
    const next: Entry = { ...cur, ...patch, id, updatedAt: now() };
    validate(next);
    result = next;
    if (target === month) {
      docs.set(monthPath(month), file(month, src.map((e) => (e.id === id ? next : e))));
    } else {
      // Tombstone in the old month, live copy in the new one.
      docs.set(monthPath(month), file(month, src.map((e) => (e.id === id ? { ...cur, deleted: true as const, updatedAt: next.updatedAt } : e))));
      docs.set(monthPath(target), file(target, [...entriesOf(docs.get(monthPath(target))), next]));
    }
  });
  return result!;
}

export async function deleteEntry(store: LedgerStore, month: MonthKey, id: string): Promise<void> {
  await store.transact([monthPath(month)], (docs) => {
    const src = entriesOf(docs.get(monthPath(month)));
    if (!src.some((e) => e.id === id)) throw new Error(`Entry ${id} not found in ${month}`);
    docs.set(monthPath(month), file(month, src.map((e) => (e.id === id ? { ...e, deleted: true as const, updatedAt: now() } : e))));
  });
}

/** Live entries for a month, newest first (same order as the Ledger: date, then createdAt, then id). */
export async function listMonth(store: LedgerStore, month: MonthKey): Promise<Entry[]> {
  const d = await store.get(monthPath(month));
  return entriesOf(d)
    .filter((e) => !e.deleted)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.id < b.id ? 1 : -1));
}

/** Months that have a file, newest first. */
export async function listMonthKeys(store: LedgerStore): Promise<MonthKey[]> {
  return (await store.paths())
    .filter((p) => p.startsWith("months/"))
    .map((p) => p.slice(7, 14))
    .sort()
    .reverse();
}

/** All stored entries (tombstones included) in the months touching [from, to]. */
export async function loadEntries(store: LedgerStore, from: string, to: string): Promise<Entry[]> {
  const files = await Promise.all(monthKeysBetween(from, to).map((m) => store.get(monthPath(m))));
  return files.flatMap((f) => entriesOf(f));
}

/** Every stored entry across all months (tombstones included). */
export async function loadAllEntries(store: LedgerStore): Promise<Entry[]> {
  const files = await Promise.all((await store.paths()).filter((p) => p.startsWith("months/")).map((p) => store.get(p)));
  return files.flatMap((f) => entriesOf(f));
}
