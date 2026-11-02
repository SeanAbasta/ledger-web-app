import { describe, expect, it } from "vitest";
import type { Trip, TripItem } from "../src/data/schema";
import { cardReminders, reminderLine, tripReminders } from "../src/data/tripReminders";

const T = "2026-10-01T00:00:00.000Z";
const trip = (o: Partial<Trip> = {}): Trip => ({ id: "t1", name: "Trip A", start: "2026-09-28", days: 7, rates: { JPY: "0.37" }, status: "open", updatedAt: T, ...o });
let n = 0;
const item = (o: Partial<TripItem> = {}): TripItem => ({ id: `i${++n}`, tripId: "t1", date: "2026-09-28", amount: 10000, currency: "JPY", accountId: "cardA", createdAt: T, updatedAt: T, ...o });
const fmt = (m: number) => `P${m / 100}`;

describe("open trip reminders", () => {
  it("adds up what an open trip holds, per card, refunds taken off", () => {
    const [r] = tripReminders([trip()], [item(), item({ accountId: "bankA", amount: 5000 }), item({ refund: true, refundOf: "x", amount: 1000 })], "PHP", "2026-10-02");
    expect(r).toMatchObject({ tripId: "t1", total: 370000 + 185000 - 37000, late: false });
    expect(r!.byAccount).toEqual({ cardA: 370000 - 37000, bankA: 185000 });
  });

  it("is late once the last day has passed, and late ones come first", () => {
    const rs = tripReminders([trip({ id: "a", name: "Early" }), trip({ id: "b", name: "Ended", start: "2026-09-01", days: 3 })], [item({ tripId: "a" }), item({ tripId: "b" })], "PHP", "2026-10-02");
    expect(rs.map((r) => [r.name, r.late])).toEqual([["Ended", true], ["Early", false]]);
    expect(tripReminders([trip()], [item()], "PHP", "2026-10-04")[0]!.late).toBe(false); // the last day itself
    expect(tripReminders([trip()], [item()], "PHP", "2026-10-05")[0]!.late).toBe(true);
  });

  it("leaves out concluded, deleted and empty trips, and ignores deleted items", () => {
    const rs = tripReminders([trip({ status: "concluded" }), trip({ id: "d", deleted: true }), trip({ id: "e" }), trip({ id: "ok", name: "Ok" })], [item(), item({ tripId: "d" }), item({ tripId: "ok" }), item({ tripId: "ok", deleted: true })], "PHP", "2026-10-02");
    expect(rs.map((r) => [r.name, r.total])).toEqual([["Ok", 370000]]);
    expect(tripReminders([trip()], [], "PHP", "2026-10-02")).toEqual([]);
  });

  it("is exact only when every figure is final or already in the base currency", () => {
    const final = tripReminders([trip()], [item({ final: 370000 }), item({ currency: "PHP", amount: 5000 })], "PHP", "2026-10-02")[0]!;
    expect(final.exact).toBe(true);
    expect(tripReminders([trip()], [item({ final: 370000 }), item()], "PHP", "2026-10-02")[0]!.exact).toBe(false);
    expect(tripReminders([trip()], [item({ currency: "EUR" }), item({ final: 370000 })], "PHP", "2026-10-02")[0]!.exact).toBe(false); // an amount with no rate is left out
  });

  it("words the line quietly while open and plainly when late", () => {
    const [r] = tripReminders([trip()], [item()], "PHP", "2026-10-02");
    expect(reminderLine(r!, fmt)).toBe("Trip A is open: about P3700 not yet in your Ledger.");
    expect(reminderLine({ ...r!, late: true }, fmt)).toBe("Trip A has ended: about P3700 is not in your Ledger until you conclude it.");
    expect(reminderLine({ ...r!, exact: true }, fmt)).toBe("Trip A is open: P3700 not yet in your Ledger.");
    expect(cardReminders([{ ...r!, exact: true }], "cardA", fmt)[0]!.text).toBe("Trip A: P3700 not yet on this card.");
    expect(cardReminders([r!], "cardA", fmt)).toEqual([{ tripId: "t1", text: "Trip A: about P3700 not yet on this card." }]);
    expect(cardReminders([r!], "cardB", fmt)).toEqual([]);
  });
});
