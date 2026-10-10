import { describe, expect, it } from "vitest";
import { getSettings, saveSettings } from "../src/data/collections";
import { makeBundle } from "../src/data/bundle";
import { LedgerStore } from "../src/data/db";
import { startAccount, startCategory } from "../src/data/defaults";
import { validateBundle } from "../src/data/exportImport";
import type { Account } from "../src/data/schema";
import { mergeDocs } from "../src/sync/merge";
import { loadLastUsed, rememberUsed } from "../src/ui/lastUsed";

const acct = (id: string, type?: "card"): Account => ({ id, name: id, currency: "PHP", openingBalance: 0, type, updatedAt: "x" });
const bank = acct("BANK");
const bank2 = acct("BANK2");
const card = acct("CARD", "card");
const all = [bank, bank2, card];
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("starting account and category", () => {
  it("with no default, nothing is picked (an expense still needs an account chosen)", () => {
    expect(startAccount("expense", undefined, undefined, all)).toBe("");
    expect(startAccount("expense", {}, { expense: "CARD" }, all)).toBe(""); // last used is ignored while the switch is off
  });
  it("uses the default while that account exists and fits", () => {
    expect(startAccount("expense", { expense: "CARD" }, undefined, all)).toBe("CARD");
    expect(startAccount("expense", { expense: "GONE" }, undefined, all)).toBe(""); // deleted: as if unset
    expect(startAccount("cardPayment", { cardPayment: "CARD" }, undefined, [bank, bank2])).toBe(""); // a card cannot pay a card
  });
  it("last used wins when switched on, and falls back to the default when it no longer exists", () => {
    const d = { expense: "CARD", lastUsed: true };
    expect(startAccount("expense", d, { expense: "BANK2" }, all)).toBe("BANK2");
    expect(startAccount("expense", d, { expense: "GONE" }, all)).toBe("CARD");
    expect(startAccount("expense", d, {}, all)).toBe("CARD");
    expect(startAccount("income", { income: "BANK2", lastUsed: true }, { expense: "BANK" }, [bank, bank2])).toBe("BANK2"); // per kind
  });
  it("category: last used, then default, then the first in the list", () => {
    const cats = ["Food", "Transport", "Bills"];
    expect(startCategory(undefined, undefined, cats)).toBe("Food");
    expect(startCategory({ category: "Bills" }, { category: "Transport" }, cats)).toBe("Bills");
    expect(startCategory({ category: "Bills", lastUsed: true }, { category: "Transport" }, cats)).toBe("Transport");
    expect(startCategory({ category: "Removed" }, undefined, cats)).toBe("Food");
    expect(startCategory(undefined, undefined, [])).toBe("");
  });
});

describe("last used is kept per device", () => {
  it("merges per kind, ignores empty values and junk", () => {
    const s = mem();
    expect(loadLastUsed(s)).toEqual({});
    rememberUsed({ expense: "CARD", category: "Food" }, s);
    rememberUsed({ cardPayment: "BANK", expense: "" }, s);
    expect(loadLastUsed(s)).toEqual({ expense: "CARD", category: "Food", cardPayment: "BANK" });
    s.setItem("ledger.lastUsed", "not json");
    expect(loadLastUsed(s)).toEqual({});
    expect(loadLastUsed(undefined)).toEqual({});
  });
});

describe("defaults in synced settings stay compatible", () => {
  it("saving another setting keeps the defaults, and settings without them still load", async () => {
    const store = await LedgerStore.open("defaults-1");
    expect((await getSettings(store)).defaults).toBeUndefined();
    await saveSettings(store, { defaults: { expense: "CARD", lastUsed: true } });
    await saveSettings(store, { defaultCurrency: "USD" });
    expect(await getSettings(store)).toMatchObject({ defaultCurrency: "USD", defaults: { expense: "CARD", lastUsed: true } });
  });
  it("an older copy's way of saving settings (spread the file, patch a field) keeps them", () => {
    const file = { schemaVersion: 1, baseCurrency: "PHP", defaultCurrency: "PHP", categories: ["Food"], defaults: { expense: "CARD" } };
    expect({ ...file, defaultCurrency: "USD" }.defaults).toEqual({ expense: "CARD" });
  });
  it("a merge keeps this device's defaults, as it does for the other settings", () => {
    const merged = mergeDocs("settings.json", { categories: ["A"], defaults: { expense: "CARD" } }, { categories: ["B"], defaults: { expense: "BANK" } });
    expect(merged).toMatchObject({ categories: ["B", "A"], defaults: { expense: "CARD" } });
    expect(mergeDocs("settings.json", { categories: ["A"] }, { categories: ["A"], defaults: { income: "BANK" } })).toMatchObject({ defaults: { income: "BANK" } });
  });
  it("backups with or without defaults are accepted; malformed ones are not", () => {
    const b = (settings: unknown) => validateBundle(makeBundle({ "settings.json": settings } as never));
    expect(b({ categories: ["Food"] })).toEqual([]);
    expect(b({ categories: ["Food"], defaults: { expense: "CARD", category: "Food", lastUsed: true } })).toEqual([]);
    expect(b({ defaults: { expense: 5 } })).toEqual(["settings.json: bad defaults"]);
    expect(b({ defaults: { lastUsed: "yes" } })).toEqual(["settings.json: bad defaults"]);
    expect(b({ defaults: [] })).toEqual(["settings.json: bad defaults"]);
  });
});
