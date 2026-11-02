import { useEffect, useState } from "react";
import { getSettings, list, listAll } from "../../data/collections";
import { loadAllEntries } from "../../data/months";
import type { Account, Entry, Person, Trip, TripItem } from "../../data/schema";
import { loadTripsFile } from "../../data/trips";
import { useLedger } from "../../ui/Ledger";

/** Everything the Travel room draws from, loaded together and again after every write. */
export interface TravelData {
  base: string;
  trips: Trip[];
  /** Live items of live trips. */
  items: TripItem[];
  /** Accounts including removed ones, so a trip can still name one. */
  accounts: (Account & { deleted?: true })[];
  people: Person[];
  /** Live entries that Conclude posted, by trip. */
  posted: Entry[];
}

export function useTravelData(): TravelData | undefined {
  const { store, rev } = useLedger();
  const [d, setD] = useState<TravelData>();
  useEffect(() => {
    let stale = false;
    (async () => {
      const [s, file, accounts, people, entries] = await Promise.all([getSettings(store), loadTripsFile(store), listAll(store, "accounts"), list(store, "people"), loadAllEntries(store)]);
      if (stale) return;
      const trips = file.trips.filter((t) => !t.deleted).sort((a, b) => (a.start !== b.start ? (a.start < b.start ? 1 : -1) : a.id < b.id ? 1 : -1));
      const live = new Set(trips.map((t) => t.id));
      setD({
        base: s.baseCurrency, trips, accounts, people,
        items: file.tripItems.filter((i) => !i.deleted && live.has(i.tripId)),
        posted: entries.filter((e) => !e.deleted && e.tripId && live.has(e.tripId)),
      });
    })();
    return () => { stale = true; };
  }, [store, rev]);
  return d;
}

export const accountLabel = (accounts: { id: string; name: string; deleted?: true }[], id?: string): string =>
  !id ? "No account" : accounts.find((a) => a.id === id)?.name ?? "Removed account";
