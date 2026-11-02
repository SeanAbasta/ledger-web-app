import type { LedgerStore } from "./db";
import type { Trip, TripItem, TripsFile } from "./schema";

export const TRIPS_PATH = "trips.json";

/** Every trip and trip expense, removed ones (tombstones) included. */
export async function loadTripsFile(store: LedgerStore): Promise<TripsFile> {
  const d = await store.get<Partial<TripsFile> & Record<string, unknown>>(TRIPS_PATH);
  return { trips: d?.trips ?? [], tripItems: d?.tripItems ?? [] };
}

/** Live trips, newest start first. */
export async function listTrips(store: LedgerStore): Promise<Trip[]> {
  return (await loadTripsFile(store)).trips.filter((t) => !t.deleted).sort((a, b) => (a.start !== b.start ? (a.start < b.start ? 1 : -1) : a.id < b.id ? 1 : -1));
}

/** Live expenses and refunds of one trip, oldest day first (the order a statement lists them). */
export async function listTripItems(store: LedgerStore, tripId: string): Promise<TripItem[]> {
  return (await loadTripsFile(store)).tripItems.filter((i) => i.tripId === tripId && !i.deleted).sort(byDay);
}

export const byDay = (a: TripItem, b: TripItem) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.id < b.id ? -1 : 1);

/** Trip names by id, tombstones included, so an entry posted from a since-deleted trip still names it. */
export async function tripNames(store: LedgerStore): Promise<Map<string, string>> {
  return new Map((await loadTripsFile(store)).trips.map((t) => [t.id, t.name]));
}
