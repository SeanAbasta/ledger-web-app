import type { SyncState } from "../../sync/engine";

/**
 * The Data health card at the top of Settings and the dot on the gear. Read-only: it only looks at the
 * sync state, when this device last synced, when a copy was last saved (Export) and the token's expiry.
 * Backed up means synced in the last 14 days, or a copy saved in the last 14 days.
 */
export type HealthState = "healthy" | "unbacked" | "expiring" | "expired" | "offline";

export interface HealthInput {
  connected: boolean;
  syncState: SyncState;
  /** The engine's error is about the token (the pill reads "Token expired"). */
  tokenError?: boolean;
  lastSynced?: string;
  lastExported?: string;
  /** Whole days until the token expires (negative once it has); undefined when no date was saved. */
  tokenDays?: number;
  now: Date;
}

export interface Health {
  state: HealthState;
  /** Show the dot on the gear: the token is expired or expires within 30 days, or nothing is backed up. */
  attention: boolean;
  backedUp: boolean;
}

const BACKUP_DAYS = 14;
const TOKEN_WARN_DAYS = 30;

const within = (iso: string | undefined, days: number, now: Date) => !!iso && now.getTime() - new Date(iso).getTime() <= days * 86400000;

export function healthOf(h: HealthInput): Health {
  const backedUp = (h.connected && within(h.lastSynced, BACKUP_DAYS, h.now)) || within(h.lastExported, BACKUP_DAYS, h.now);
  const expired = h.connected && ((h.tokenDays !== undefined && h.tokenDays < 0) || (h.syncState === "error" && !!h.tokenError));
  const expiring = h.connected && !expired && h.tokenDays !== undefined && h.tokenDays <= TOKEN_WARN_DAYS;
  const state: HealthState = expired ? "expired" : expiring ? "expiring" : h.syncState === "offline" ? "offline" : backedUp ? "healthy" : "unbacked";
  return { state, attention: expired || expiring || (!backedUp && state !== "offline"), backedUp };
}

/** "expires today", "expires in 1 day", "expires in 12 days": for a token with 0 or more days left. */
export const tokenExpiry = (days: number) => (days <= 0 ? "expires today" : `expires in ${days} ${days === 1 ? "day" : "days"}`);

const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "today, 1:42 pm", "yesterday, 9:05 am", "Oct 3, 9:05 am". */
export function syncedWords(iso: string, now: Date): string {
  const d = new Date(iso);
  const y = new Date(now.getTime() - 86400000);
  const day = dayKey(d) === dayKey(now) ? "today" : dayKey(d) === dayKey(y) ? "yesterday" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day}, ${time(d)}`;
}

/** "never", "today", "yesterday", "12 days ago". */
export function sinceWords(iso: string | undefined, now: Date): string {
  if (!iso) return "never";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
