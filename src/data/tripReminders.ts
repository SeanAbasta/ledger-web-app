import { NO_ACCOUNT } from "./summary";
import type { Minor, Trip, TripItem } from "./schema";
import { baseOf, tripEnd } from "./tripMath";

/** An open trip whose money is not in the Ledger yet. Read-only: nothing here changes a balance or a total. */
export interface TripReminder {
  tripId: string;
  name: string;
  /** The trip's last day has passed. */
  late: boolean;
  /** About how much, in the base currency (estimates until each expense is final), refunds taken off. */
  total: Minor;
  /** The same, per account id (NO_ACCOUNT for expenses with none). */
  byAccount: Record<string, Minor>;
}

export function tripReminders(trips: Trip[], items: TripItem[], base: string, today: string): TripReminder[] {
  const out: TripReminder[] = [];
  for (const t of trips) {
    if (t.deleted || t.status !== "open") continue;
    const byAccount: Record<string, Minor> = {};
    let total = 0;
    for (const i of items) {
      if (i.deleted || i.tripId !== t.id) continue;
      const b = baseOf(i, t, base);
      if (b === undefined) continue;
      const signed = i.refund ? -b : b;
      total += signed;
      const k = i.accountId ?? NO_ACCOUNT;
      byAccount[k] = (byAccount[k] ?? 0) + signed;
    }
    if (total > 0) out.push({ tripId: t.id, name: t.name, late: today > tripEnd(t), total, byAccount });
  }
  return out.sort((a, z) => Number(z.late) - Number(a.late) || (a.name < z.name ? -1 : 1));
}

/** The Dashboard line. Quiet while the trip runs; plainer once it has ended. */
export const reminderLine = (r: TripReminder, fmt: (n: Minor) => string): string =>
  r.late ? `${r.name} has ended: about ${fmt(r.total)} is not in your Ledger until you conclude it.` : `${r.name} is open: about ${fmt(r.total)} not yet in your Ledger.`;

/** The line on a card: what an open trip has charged to it that the card's numbers do not show yet. */
export function cardReminders(rs: TripReminder[], accountId: string, fmt: (n: Minor) => string): { tripId: string; text: string }[] {
  return rs.filter((r) => (r.byAccount[accountId] ?? 0) > 0).map((r) => ({ tripId: r.tripId, text: `${r.name}: about ${fmt(r.byAccount[accountId]!)} not yet on this card.` }));
}
