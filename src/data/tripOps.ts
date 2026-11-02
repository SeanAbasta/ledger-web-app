// Writing trips: create, edit, delete with a way back, and Conclude with its Undo. Every operation is one
// transaction, so a crash or an error leaves the trip and the Ledger exactly as they were.
import type { LedgerStore } from "./db";
import { monthPath } from "./months";
import { monthOf, type Account, type Entry, type Trip, type TripItem, type TripsFile } from "./schema";
import { concludePlan, type ConcludePlan } from "./tripMath";
import { TRIPS_PATH } from "./trips";
import { ulid } from "./ulid";

const now = () => new Date().toISOString();
const file = (f: TripsFile) => f as unknown as Record<string, unknown>;
const read = (docs: Map<string, Record<string, unknown> | undefined>): TripsFile => {
  const d = docs.get(TRIPS_PATH) as Partial<TripsFile> | undefined;
  return { trips: d?.trips ?? [], tripItems: d?.tripItems ?? [] };
};

/** A strictly newer stamp than `prev`, so a change always beats the copy it replaces in a merge. */
const after = (prev: string) => { const t = now(); return t > prev ? t : new Date(Date.parse(prev) + 1).toISOString(); };

export type NewTrip = Omit<Trip, "id" | "updatedAt" | "status" | "concludedAt" | "deleted" | "rates"> & { rates?: Trip["rates"] };

function tripProblem(t: Pick<Trip, "name" | "start" | "days" | "budget">): string | undefined {
  if (!t.name.trim()) return "Name the trip";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.start)) return "Pick a start date";
  if (!Number.isInteger(t.days) || t.days < 1) return "Days must be 1 or more";
  if (t.budget !== undefined && (!Number.isInteger(t.budget) || t.budget < 0)) return "Budget must be an amount";
  return undefined;
}

export async function addTrip(store: LedgerStore, input: NewTrip): Promise<Trip> {
  const problem = tripProblem(input);
  if (problem) throw new Error(problem);
  const trip: Trip = { ...input, name: input.name.trim(), rates: input.rates ?? {}, id: ulid(), status: "open", updatedAt: now() };
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    docs.set(TRIPS_PATH, file({ ...f, trips: [...f.trips, trip] }));
  });
  return trip;
}

/** Change an open trip. A concluded trip is a locked record. */
export async function updateTrip(store: LedgerStore, id: string, patch: Partial<NewTrip>): Promise<Trip> {
  let out!: Trip;
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const cur = f.trips.find((t) => t.id === id && !t.deleted);
    if (!cur) throw new Error("Trip not found");
    if (cur.status !== "open") throw new Error("A concluded trip cannot be changed");
    const next: Trip = { ...cur, ...patch, id, updatedAt: after(cur.updatedAt) };
    if (patch.name !== undefined) next.name = patch.name.trim();
    const problem = tripProblem(next);
    if (problem) throw new Error(problem);
    out = next;
    docs.set(TRIPS_PATH, file({ ...f, trips: f.trips.map((t) => (t.id === id ? next : t)) }));
  });
  return out;
}

export type NewTripItem = Omit<TripItem, "id" | "createdAt" | "updatedAt" | "deleted">;

function itemProblem(i: Pick<TripItem, "amount" | "date" | "currency" | "final" | "refund" | "refundOf" | "split">): string | undefined {
  if (!Number.isInteger(i.amount) || i.amount <= 0) return "Enter an amount";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return "Pick a date";
  if (!/^[A-Za-z]{3}$/.test(i.currency)) return "Pick a currency";
  if (i.final !== undefined && (!Number.isInteger(i.final) || i.final <= 0)) return "Enter the statement amount";
  if (i.refund && !i.refundOf) return "A refund needs the expense it refunds";
  if (i.refund && i.split) return "A refund cannot be split";
  return undefined;
}

export async function addTripItem(store: LedgerStore, input: NewTripItem): Promise<TripItem> {
  const problem = itemProblem(input);
  if (problem) throw new Error(problem);
  const t = now();
  const item: TripItem = { ...input, id: ulid(), createdAt: t, updatedAt: t };
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const trip = f.trips.find((x) => x.id === input.tripId && !x.deleted);
    if (!trip) throw new Error("Trip not found");
    if (trip.status !== "open") throw new Error("A concluded trip cannot be changed");
    if (item.refund && !f.tripItems.some((x) => x.id === item.refundOf && x.tripId === item.tripId && !x.deleted && !x.refund)) throw new Error("That expense is no longer in the trip");
    docs.set(TRIPS_PATH, file({ ...f, tripItems: [...f.tripItems, item] }));
  });
  return item;
}

/** Change one expense. `final: undefined` in the patch clears the statement figure. */
export async function updateTripItem(store: LedgerStore, id: string, patch: Partial<NewTripItem>): Promise<TripItem> {
  let out!: TripItem;
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const cur = f.tripItems.find((x) => x.id === id && !x.deleted);
    if (!cur) throw new Error("Expense not found");
    const trip = f.trips.find((x) => x.id === cur.tripId && !x.deleted);
    if (!trip || trip.status !== "open") throw new Error("A concluded trip cannot be changed");
    const next: TripItem = { ...cur, ...patch, id, tripId: cur.tripId, updatedAt: after(cur.updatedAt) };
    if (patch.final === undefined && "final" in patch) delete next.final;
    const problem = itemProblem(next);
    if (problem) throw new Error(problem);
    out = next;
    docs.set(TRIPS_PATH, file({ ...f, tripItems: f.tripItems.map((x) => (x.id === id ? next : x)) }));
  });
  return out;
}

/** Remove one expense (a tombstone). Refunds of it go with it. */
export async function deleteTripItem(store: LedgerStore, id: string): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const cur = f.tripItems.find((x) => x.id === id && !x.deleted);
    if (!cur) throw new Error("Expense not found");
    const trip = f.trips.find((x) => x.id === cur.tripId && !x.deleted);
    if (!trip || trip.status !== "open") throw new Error("A concluded trip cannot be changed");
    docs.set(TRIPS_PATH, file({ ...f, tripItems: f.tripItems.map((x) => {
      if (x.deleted || (x.id !== id && x.refundOf !== id)) return x;
      removed.push(x.id);
      return { ...x, deleted: true as const, updatedAt: after(x.updatedAt) };
    }) }));
  });
  return { removed };
}

/** Bring back items removed by `deleteTripItem`. */
export async function restoreTripItems(store: LedgerStore, ids: string[]): Promise<void> {
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    docs.set(TRIPS_PATH, file({ ...f, tripItems: f.tripItems.map((x) => {
      if (!ids.includes(x.id) || !x.deleted) return x;
      const { deleted: _gone, ...live } = x;
      return { ...live, updatedAt: after(x.updatedAt) };
    }) }));
  });
}

/**
 * Delete a trip. An open trip takes its expenses with it. A concluded trip's expenses are already in the
 * Ledger as entries, which stay. Returns the stamp used, so `restoreTrip` can bring back exactly what went.
 */
export async function deleteTrip(store: LedgerStore, id: string): Promise<{ stamp: string }> {
  let stamp = "";
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const cur = f.trips.find((t) => t.id === id && !t.deleted);
    if (!cur) throw new Error("Trip not found");
    // Newer than the trip and every item, so no item removed earlier can carry the same stamp.
    stamp = after([cur.updatedAt, ...f.tripItems.filter((x) => x.tripId === id).map((x) => x.updatedAt)].sort().pop()!);
    docs.set(TRIPS_PATH, file({
      trips: f.trips.map((t) => (t.id === id ? { ...t, deleted: true as const, updatedAt: stamp } : t)),
      tripItems: f.tripItems.map((x) => (x.tripId === id && !x.deleted ? { ...x, deleted: true as const, updatedAt: stamp } : x)),
    }));
  });
  return { stamp };
}

/** Undo of `deleteTrip`: the trip and the items that were removed with it. */
export async function restoreTrip(store: LedgerStore, id: string, stamp: string): Promise<void> {
  await store.transact([TRIPS_PATH], (docs) => {
    const f = read(docs);
    const cur = f.trips.find((t) => t.id === id);
    if (!cur?.deleted) throw new Error("Trip is not deleted");
    const t = after(stamp);
    docs.set(TRIPS_PATH, file({
      trips: f.trips.map((x) => { if (x.id !== id) return x; const { deleted: _g, ...live } = x; return { ...live, updatedAt: t }; }),
      tripItems: f.tripItems.map((x) => { if (x.tripId !== id || !x.deleted || x.updatedAt !== stamp) return x; const { deleted: _g, ...live } = x; return { ...live, updatedAt: t }; }),
    }));
  });
}

// ---- Conclude --------------------------------------------------------------------------------

export class ConcludeBlocked extends Error {
  constructor(public problems: string[]) {
    super(problems[0] ?? "This trip cannot be concluded yet");
  }
}

/** What Conclude would do right now, without writing anything. */
export async function planConclude(store: LedgerStore, tripId: string, accounts: Account[], base: string): Promise<ConcludePlan> {
  const f = read(new Map([[TRIPS_PATH, (await store.get(TRIPS_PATH)) ?? undefined]]));
  const trip = f.trips.find((t) => t.id === tripId && !t.deleted);
  if (!trip) throw new Error("Trip not found");
  if (trip.status !== "open") throw new Error("This trip is already concluded");
  return concludePlan(trip, f.tripItems, accounts, base);
}

/**
 * Post a trip's expenses to the Ledger and mark the trip concluded, in one transaction. Throws
 * `ConcludeBlocked` with the reasons when something is still estimated. The trip's items are kept (they let
 * Undo reopen the trip); entries carry `tripId` so the record can be worked out from them later.
 */
export async function concludeTrip(store: LedgerStore, tripId: string, accounts: Account[], base: string): Promise<{ entries: Entry[] }> {
  const first = await planConclude(store, tripId, accounts, base);
  if (first.problems.length) throw new ConcludeBlocked(first.problems);
  const months = [...new Set(first.entries.map((e) => monthPath(monthOf(e.date))))];
  let posted: Entry[] = [];
  await store.transact([TRIPS_PATH, ...months], (docs) => {
    const f = read(docs);
    const trip = f.trips.find((t) => t.id === tripId && !t.deleted);
    if (!trip || trip.status !== "open") throw new Error("This trip is already concluded");
    // Worked out again inside the transaction, from the data it will write over.
    const plan = concludePlan(trip, f.tripItems, accounts, base);
    if (plan.problems.length) throw new ConcludeBlocked(plan.problems);
    for (const e of plan.entries) {
      const p = monthPath(monthOf(e.date));
      if (!months.includes(p)) throw new Error("The trip changed while concluding; try again");
      const doc = docs.get(p);
      docs.set(p, { month: monthOf(e.date), ...doc, entries: [...((doc?.entries as Entry[] | undefined) ?? []), e] });
    }
    docs.set(TRIPS_PATH, file({ ...f, trips: f.trips.map((x) => (x.id === tripId ? { ...x, status: "concluded" as const, concludedAt: now(), updatedAt: after(x.updatedAt) } : x)) }));
    posted = plan.entries;
  });
  return { entries: posted };
}

/**
 * Undo Conclude: tombstone every live entry the trip posted and reopen it. Meant for the toast right after
 * Conclude; the trip's items were never touched, so it is exactly as it was.
 */
export async function undoConclude(store: LedgerStore, tripId: string): Promise<{ removed: number }> {
  const paths = (await store.paths()).filter((p) => p.startsWith("months/"));
  let removed = 0;
  await store.transact([TRIPS_PATH, ...paths], (docs) => {
    const f = read(docs);
    const trip = f.trips.find((t) => t.id === tripId && !t.deleted);
    if (!trip || trip.status !== "concluded") throw new Error("This trip is not concluded");
    for (const p of paths) {
      const doc = docs.get(p);
      const entries = (doc?.entries as Entry[] | undefined) ?? [];
      if (!entries.some((e) => e.tripId === tripId && !e.deleted)) continue;
      docs.set(p, { ...doc, entries: entries.map((e) => {
        if (e.tripId !== tripId || e.deleted) return e;
        removed++;
        return { ...e, deleted: true as const, updatedAt: after(e.updatedAt) };
      }) });
    }
    const { concludedAt: _c, ...rest } = trip;
    docs.set(TRIPS_PATH, file({ ...f, trips: f.trips.map((x) => (x.id === tripId ? { ...rest, status: "open" as const, updatedAt: after(trip.updatedAt) } : x)) }));
  });
  return { removed };
}
