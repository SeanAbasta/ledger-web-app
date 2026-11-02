import { beforeEach, describe, expect, it } from "vitest";
import { upsert, list } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { loadAllEntries, listMonth } from "../src/data/months";
import { moveAndRemove } from "../src/data/accountMove";
import type { Account } from "../src/data/schema";
import { buildSplit } from "../src/data/splits";
import { addTrip, addTripItem, concludeTrip, ConcludeBlocked, deleteTrip, deleteTripItem, planConclude, restoreTrip, restoreTripItems, undoConclude, updateTrip, updateTripItem } from "../src/data/tripOps";
import { listTripItems, listTrips, loadTripsFile } from "../src/data/trips";
import { accountUsage, personUsage, usageText } from "../src/data/usage";

let store: LedgerStore;
let n = 0;
let cardA: Account, bankA: Account;
const trip0 = { name: "Trip A", start: "2026-09-28", days: 7, budget: 5000000, rates: { JPY: "0.37" } };

beforeEach(async () => {
  store = await LedgerStore.open(`ops-${n++}`);
  cardA = (await upsert(store, "accounts", { name: "Card A", currency: "PHP", openingBalance: 0, type: "card", statementDay: 5 })) as Account;
  bankA = (await upsert(store, "accounts", { name: "Bank A", currency: "PHP", openingBalance: 0 })) as Account;
});

const accounts = () => list(store, "accounts");
const yen = (tripId: string, o: Record<string, unknown> = {}) => addTripItem(store, { tripId, date: "2026-09-28", amount: 12345, currency: "JPY", category: "Food", accountId: cardA.id, ...o });

describe("trips and expenses", () => {
  it("adds, edits and lists trips, newest start first", async () => {
    const a = await addTrip(store, trip0);
    const b = await addTrip(store, { ...trip0, name: "Trip B", start: "2026-11-02" });
    expect((await listTrips(store)).map((t) => t.name)).toEqual(["Trip B", "Trip A"]);
    expect(a).toMatchObject({ status: "open", rates: { JPY: "0.37" } });
    const edited = await updateTrip(store, a.id, { name: "  Trip A2 ", days: 9 });
    expect(edited).toMatchObject({ name: "Trip A2", days: 9 });
    expect(edited.updatedAt > a.updatedAt).toBe(true);
    expect(b.id).not.toBe(a.id);
  });

  it("refuses a trip with no name, no days, or a bad budget, with a plain reason", async () => {
    await expect(addTrip(store, { ...trip0, name: " " })).rejects.toThrow("Name the trip");
    await expect(addTrip(store, { ...trip0, days: 0 })).rejects.toThrow("Days must be 1 or more");
    await expect(addTrip(store, { ...trip0, budget: -1 })).rejects.toThrow("Budget must be an amount");
  });

  it("adds and edits an expense, and typing the statement figure makes it Final", async () => {
    const t = await addTrip(store, trip0);
    const i = await yen(t.id);
    const f = await updateTripItem(store, i.id, { final: 456789 });
    expect(f.final).toBe(456789);
    const cleared = await updateTripItem(store, i.id, { final: undefined });
    expect("final" in cleared).toBe(false);
    await expect(updateTripItem(store, i.id, { amount: 0 })).rejects.toThrow("Enter an amount");
    expect(await listTripItems(store, t.id)).toHaveLength(1);
  });

  it("a refund must point at an expense in the same trip, and goes when its expense goes", async () => {
    const t = await addTrip(store, trip0);
    const other = await addTrip(store, { ...trip0, name: "Trip B" });
    const i = await yen(t.id);
    await expect(yen(t.id, { refund: true, refundOf: "nope", amount: 100 })).rejects.toThrow("no longer in the trip");
    await expect(yen(other.id, { refund: true, refundOf: i.id, amount: 100 })).rejects.toThrow("no longer in the trip");
    const r = await yen(t.id, { refund: true, refundOf: i.id, amount: 100 });
    const gone = await deleteTripItem(store, i.id);
    expect(gone.removed.sort()).toEqual([i.id, r.id].sort());
    expect(await listTripItems(store, t.id)).toEqual([]);
    await restoreTripItems(store, gone.removed);
    expect(await listTripItems(store, t.id)).toHaveLength(2);
  });

  it("deleting a trip takes its expenses with it, and Undo brings back the same ones", async () => {
    const t = await addTrip(store, trip0);
    const kept = await yen(t.id);
    const earlier = await yen(t.id, { note: "deleted before" });
    await deleteTripItem(store, earlier.id);
    const { stamp } = await deleteTrip(store, t.id);
    expect(await listTrips(store)).toEqual([]);
    expect((await loadTripsFile(store)).tripItems.every((x) => x.deleted)).toBe(true);
    await restoreTrip(store, t.id, stamp);
    expect((await listTrips(store)).map((x) => x.id)).toEqual([t.id]);
    expect((await listTripItems(store, t.id)).map((x) => x.id)).toEqual([kept.id]); // the earlier delete stays deleted
  });
});

describe("Conclude", () => {
  async function ready() {
    const t = await addTrip(store, trip0);
    const a = await yen(t.id, { final: 456789, note: "Dinner" });
    const b = await yen(t.id, { date: "2026-10-02", amount: 5000, final: 190000, accountId: bankA.id, category: "Transport" });
    return { t, a, b };
  }

  it("is blocked, and writes nothing, while a figure is missing", async () => {
    const { t } = await ready();
    await yen(t.id, { note: "no figure yet" });
    const plan = await planConclude(store, t.id, await accounts(), "PHP");
    expect(plan.problems).toEqual(["1 still needs a statement figure: Card A 1"]);
    await expect(concludeTrip(store, t.id, await accounts(), "PHP")).rejects.toBeInstanceOf(ConcludeBlocked);
    expect(await loadAllEntries(store)).toEqual([]);
    expect((await listTrips(store))[0]?.status).toBe("open");
  });

  it("posts one entry per expense to the months they happened in, and locks the trip", async () => {
    const { t } = await ready();
    const before = await store.dirtyPaths();
    const { entries } = await concludeTrip(store, t.id, await accounts(), "PHP");
    expect(entries).toHaveLength(2);
    const sep = await listMonth(store, "2026-09");
    const oct = await listMonth(store, "2026-10");
    expect(sep[0]).toMatchObject({ amount: 456789, currency: "PHP", tripId: t.id, local: { amount: 12345, currency: "JPY" }, accountId: cardA.id, note: "Dinner" });
    expect(oct[0]).toMatchObject({ amount: 190000, accountId: bankA.id, category: "Transport" });
    const trip = (await listTrips(store))[0]!;
    expect(trip.status).toBe("concluded");
    expect(trip.concludedAt).toBeTruthy();
    expect([...new Set(await store.dirtyPaths())].sort()).toEqual([...new Set([...before, "months/2026-09.json", "months/2026-10.json", "trips.json"])].sort());
    await expect(updateTrip(store, t.id, { name: "x" })).rejects.toThrow("concluded");
    await expect(yen(t.id)).rejects.toThrow("concluded");
    await expect(concludeTrip(store, t.id, await accounts(), "PHP")).rejects.toThrow("already concluded");
  });

  it("rebuilds splits so people owe base currency", async () => {
    const t = await addTrip(store, trip0);
    const alex = await upsert(store, "people", { name: "Alex" });
    await yen(t.id, { final: 456789, split: buildSplit({ amount: 12345, paidBy: "me", mode: "half", people: [alex.id] }) });
    const { entries } = await concludeTrip(store, t.id, await accounts(), "PHP");
    expect(entries[0]!.split?.shares).toEqual([{ personId: alex.id, amount: 228394 }]);
  });

  it("Undo removes what was posted and reopens the trip exactly as it was", async () => {
    const { t } = await ready();
    const itemsBefore = await listTripItems(store, t.id);
    await concludeTrip(store, t.id, await accounts(), "PHP");
    expect(await undoConclude(store, t.id)).toEqual({ removed: 2 });
    expect(await listMonth(store, "2026-09")).toEqual([]);
    expect(await listMonth(store, "2026-10")).toEqual([]);
    const trip = (await listTrips(store))[0]!;
    expect(trip.status).toBe("open");
    expect("concludedAt" in trip).toBe(false);
    expect(await listTripItems(store, t.id)).toEqual(itemsBefore);
    // and it can be concluded again
    expect((await concludeTrip(store, t.id, await accounts(), "PHP")).entries).toHaveLength(2);
    expect((await loadAllEntries(store)).filter((e) => !e.deleted)).toHaveLength(2);
  });

  it("Undo refuses a trip that is not concluded", async () => {
    const { t } = await ready();
    await expect(undoConclude(store, t.id)).rejects.toThrow("not concluded");
  });

  it("deleting a concluded trip removes only the record; its entries stay", async () => {
    const { t } = await ready();
    await concludeTrip(store, t.id, await accounts(), "PHP");
    await deleteTrip(store, t.id);
    expect(await listTrips(store)).toEqual([]);
    expect((await loadAllEntries(store)).filter((e) => !e.deleted)).toHaveLength(2);
  });

  it("changes nothing if the write fails part-way", async () => {
    const { t } = await ready();
    const entries = await loadAllEntries(store);
    const real = store.transact.bind(store);
    store.transact = async (paths, fn) => real(paths, (docs) => { fn(docs); throw new Error("disk full"); });
    await expect(concludeTrip(store, t.id, await accounts(), "PHP")).rejects.toThrow("disk full");
    store.transact = real;
    expect(await loadAllEntries(store)).toEqual(entries);
    expect((await listTrips(store))[0]?.status).toBe("open");
  });
});

describe("removing an account or person that an open trip uses", () => {
  it("counts trip expenses, and moves them with the account", async () => {
    const t = await addTrip(store, { ...trip0, accountId: cardA.id });
    await yen(t.id);
    await yen(t.id);
    const file = await loadTripsFile(store);
    expect(accountUsage(cardA.id, [], [], file)).toEqual({ entries: 0, plans: 0, trips: 3 }); // two expenses and the trip's default
    expect(usageText(accountUsage(cardA.id, [], [], file))).toBe("3 trip items");
    expect(accountUsage(cardA.id, [], [])).toEqual({ entries: 0, plans: 0 });

    const card2 = (await upsert(store, "accounts", { name: "Card B", currency: "PHP", openingBalance: 0, type: "card", statementDay: 9 })) as Account;
    const r = await moveAndRemove(store, cardA.id, card2.id);
    expect(r.trips).toBe(3);
    const after = await loadTripsFile(store);
    expect(after.trips[0]!.accountId).toBe(card2.id);
    expect(after.tripItems.every((x) => x.accountId === card2.id)).toBe(true);
    expect((await planConclude(store, t.id, await accounts(), "PHP")).problems).not.toContain("2 are on a removed card or account");
  });

  it("counts a person in a trip split, and ignores concluded and deleted trips", async () => {
    const alex = await upsert(store, "people", { name: "Alex" });
    const t = await addTrip(store, trip0);
    await yen(t.id, { final: 100, split: buildSplit({ amount: 12345, paidBy: "me", mode: "half", people: [alex.id] }) });
    expect(personUsage(alex.id, [], [], [], await loadTripsFile(store)).trips).toBe(1);
    await concludeTrip(store, t.id, await accounts(), "PHP");
    expect(personUsage(alex.id, [], [], [], await loadTripsFile(store)).trips).toBeUndefined();
  });
});
