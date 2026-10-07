import { describe, expect, it } from "vitest";
import { clearConfig, daysLeft, deviceName, loadConfig, saveConfig } from "../src/sync/config";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe("config", () => {
  it("round-trips and clears", () => {
    const s = mem();
    expect(loadConfig(s)).toBeNull();
    expect(saveConfig({ token: "t", owner: "o", repo: "r" }, s)).toBe(true);
    expect(loadConfig(s)).toEqual({ token: "t", owner: "o", repo: "r" });
    clearConfig(s);
    expect(loadConfig(s)).toBeNull();
  });
  it("survives blocked or corrupt storage", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(loadConfig(blocked)).toBeNull();
    expect(saveConfig({ token: "t", owner: "o", repo: "r" }, blocked)).toBe(false);
    expect(() => clearConfig(blocked)).not.toThrow();
    const s = mem();
    s.setItem("ledger.sync", "{not json");
    expect(loadConfig(s)).toBeNull();
    s.setItem("ledger.sync", JSON.stringify({ owner: "o" }));
    expect(loadConfig(s)).toBeNull();
    expect(saveConfig({ token: "t", owner: "o", repo: "r" }, undefined)).toBe(false);
  });
  it("counts days to token expiry", () => {
    const base = { token: "t", owner: "o", repo: "r" };
    const today = new Date(2026, 9, 7);
    expect(daysLeft({ ...base, tokenExpires: "2026-10-17" }, today)).toBe(10);
    expect(daysLeft({ ...base, tokenExpires: "2026-10-01" }, today)).toBe(-6);
    expect(daysLeft(base, today)).toBeUndefined();
    expect(daysLeft({ ...base, tokenExpires: "soon" }, today)).toBeUndefined();
  });
  it("names devices", () => {
    expect(deviceName("01HZABCD3F2A", "MacIntel")).toBe("Mac-3f2a");
    expect(deviceName("01HZABCD3F2A", "Win32")).toBe("Windows-3f2a");
    expect(deviceName("01HZABCD3F2A", "")).toBe("Browser-3f2a");
  });
});
