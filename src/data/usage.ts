import { nonZero, personLines, sumBy, type ByCurrency } from "./balances";
import type { LedgerItem } from "./rules";
import type { Entry, Rule, Split, TripsFile } from "./schema";

/** What refers to a person or an account, so Settings can say what removing it affects. */
export interface Usage {
  /** Live entries that refer to it. */
  entries: number;
  /** Live recurring payments and installment plans that refer to it. */
  plans: number;
  /** Expenses in open trips (and open trips) that refer to it. Left out when there are none. */
  trips?: number;
}

/** Live expenses of open trips, and open trips, that satisfy `hit`. Concluded trips hold nothing live. */
function tripRefs(trips: TripsFile | undefined, itemHit: (i: TripsFile["tripItems"][number]) => boolean, tripHit: (t: TripsFile["trips"][number]) => boolean): number {
  if (!trips) return 0;
  const open = new Set(trips.trips.filter((t) => !t.deleted && t.status === "open").map((t) => t.id));
  return trips.tripItems.filter((i) => !i.deleted && open.has(i.tripId) && itemHit(i)).length + trips.trips.filter((t) => open.has(t.id) && tripHit(t)).length;
}
const withTrips = <U extends Usage>(u: U, n: number): U => (n ? { ...u, trips: n } : u);

export interface PersonUsage extends Usage {
  /** Balance with the person up to the items given, per currency, zeros dropped. Positive: they owe me. */
  owed: ByCurrency;
}

const inSplit = (split: Split | undefined, id: string) => !!split && (split.paidBy === id || split.shares.some((s) => s.personId === id));

/** Entries and plans that split with the person or settle with them, and what they owe (from `items`). */
export function personUsage(personId: string, entries: Entry[], rules: Rule[], items: LedgerItem[], trips?: TripsFile): PersonUsage {
  return withTrips({
    entries: entries.filter((e) => !e.deleted && (inSplit(e.split, personId) || (e.kind === "settlement" && e.personId === personId))).length,
    plans: rules.filter((r) => !r.deleted && inSplit(r.split, personId)).length,
    owed: Object.fromEntries(nonZero(sumBy(personLines(personId, items)))),
  }, tripRefs(trips, (i) => inSplit(i.split, personId), () => false));
}

/** Entries and plans that pay from or into the account (including later changes to a plan). */
export function accountUsage(accountId: string, entries: Entry[], rules: Rule[], trips?: TripsFile): Usage {
  return withTrips({
    entries: entries.filter((e) => !e.deleted && (e.accountId === accountId || e.toAccountId === accountId)).length,
    plans: rules.filter((r) => !r.deleted && (r.accountId === accountId || (r.revisions ?? []).some((x) => x.accountId === accountId))).length,
  }, tripRefs(trips, (i) => i.accountId === accountId, (t) => t.accountId === accountId));
}

/** "4 entries and 1 plan", "1 entry", "2 plans". Empty when nothing refers to it. */
export function usageText(u: Usage): string {
  const parts = [
    u.entries ? `${u.entries} ${u.entries === 1 ? "entry" : "entries"}` : "",
    u.plans ? `${u.plans} ${u.plans === 1 ? "plan" : "plans"}` : "",
    u.trips ? `${u.trips} ${u.trips === 1 ? "trip item" : "trip items"}` : "",
  ].filter(Boolean);
  return parts.length > 2 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join(" and ");
}

/** Live entries and plans that point at an account that was removed or no longer exists, and those account ids. */
export interface Orphans {
  entries: Entry[];
  rules: Rule[];
  /** The missing or removed account ids they point at. */
  ids: string[];
}

/** What the Dashboard's Fix link lists. An entry with no account at all is not an orphan. `accounts` may include removed ones. */
export function orphans(entries: Entry[], rules: Rule[], accounts: { id: string; deleted?: true }[]): Orphans {
  const live = new Set(accounts.filter((a) => !a.deleted).map((a) => a.id));
  const ids = new Set<string>();
  const missing = (id: string | undefined) => {
    if (!id || live.has(id)) return false;
    ids.add(id);
    return true;
  };
  // Every id is checked (no short-circuit), so each missing account is collected.
  const anyMissing = (xs: (string | undefined)[]) => xs.map(missing).some(Boolean);
  return {
    entries: entries.filter((e) => !e.deleted && anyMissing([e.accountId, e.toAccountId])),
    rules: rules.filter((r) => !r.deleted && anyMissing([r.accountId, ...(r.revisions ?? []).map((x) => x.accountId)])),
    ids: [...ids],
  };
}
