import { describe, expect, it } from "vitest";
import { healthOf, sinceWords, syncedWords, tokenExpiry } from "../src/features/settings/health";

const now = new Date("2026-10-22T13:42:00");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const base = { connected: true, syncState: "synced" as const, now };

describe("healthOf", () => {
  it("synced recently: safe, no dot, even with no copy saved", () => {
    const h = healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 200 });
    expect(h.state).toBe("healthy");
    expect(h.attention).toBe(false);
  });
  it("sync off and no copy ever: not backed up, dot", () => {
    const h = healthOf({ connected: false, syncState: "unconfigured", now });
    expect(h.state).toBe("unbacked");
    expect(h.attention).toBe(true);
  });
  it("sync off with a copy saved this week: backed up, no dot", () => {
    const h = healthOf({ connected: false, syncState: "unconfigured", lastExported: daysAgo(3), now });
    expect(h.state).toBe("healthy");
    expect(h.attention).toBe(false);
  });
  it("a copy older than 14 days and no sync: not backed up", () => {
    expect(healthOf({ connected: false, syncState: "unconfigured", lastExported: daysAgo(15), now }).attention).toBe(true);
    expect(healthOf({ connected: false, syncState: "unconfigured", lastExported: daysAgo(14), now }).attention).toBe(false);
  });
  it("connected but not synced for 14 days and no recent copy: not backed up", () => {
    const h = healthOf({ ...base, syncState: "needs-sync", lastSynced: daysAgo(20), tokenDays: 200 });
    expect(h.state).toBe("unbacked");
    expect(h.attention).toBe(true);
  });
  it("token expiring within 30 days: its own state and a dot", () => {
    const h = healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 12 });
    expect(h.state).toBe("expiring");
    expect(h.attention).toBe(true);
    expect(healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 31 }).attention).toBe(false);
  });
  it("the token warning starts at 30 days and not before", () => {
    expect(healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 30 }).state).toBe("expiring");
    expect(healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 31 }).state).toBe("healthy");
    expect(healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: 0 }).state).toBe("expiring");
  });
  it("token expired, by date or by the engine's error", () => {
    expect(healthOf({ ...base, lastSynced: daysAgo(0), tokenDays: -1 }).state).toBe("expired");
    expect(healthOf({ ...base, syncState: "error", tokenError: true, lastSynced: daysAgo(0) }).state).toBe("expired");
  });
  it("offline is the quiet state, but a token problem still shows the dot", () => {
    const h = healthOf({ ...base, syncState: "offline", lastSynced: daysAgo(1), tokenDays: 5 });
    expect(h.state).toBe("expiring");
    const q = healthOf({ ...base, syncState: "offline", lastSynced: daysAgo(1), tokenDays: 200 });
    expect(q.state).toBe("offline");
    expect(q.attention).toBe(false);
  });
});

describe("words", () => {
  it("says when the token runs out, with today for the last day", () => {
    expect(tokenExpiry(0)).toBe("expires today");
    expect(tokenExpiry(1)).toBe("expires in 1 day");
    expect(tokenExpiry(12)).toBe("expires in 12 days");
  });
  it("says when it synced", () => {
    expect(syncedWords(new Date("2026-10-22T13:42:00").toISOString(), now)).toMatch(/^today, 1:42/);
    expect(syncedWords(new Date("2026-10-21T09:05:00").toISOString(), now)).toMatch(/^yesterday, 9:05/);
    expect(syncedWords(new Date("2026-10-03T09:05:00").toISOString(), now)).toMatch(/^Oct 3, 9:05/);
  });
  it("says how long ago a copy was saved", () => {
    expect(sinceWords(undefined, now)).toBe("never");
    expect(sinceWords(daysAgo(0), now)).toBe("today");
    expect(sinceWords(daysAgo(1), now)).toBe("yesterday");
    expect(sinceWords(daysAgo(12), now)).toBe("12 days ago");
  });
});
