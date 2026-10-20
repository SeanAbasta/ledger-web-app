import { describe, expect, it } from "vitest";
import type { Account } from "../src/data/schema";
import { accountEdit, cardEdit, sameAccount } from "../src/features/settings/accountEdit";

const U = "2026-10-01T00:00:00Z";
const bank: Account = { id: "A1", name: "Bank A", currency: "PHP", openingBalance: 5000000, type: "bank", updatedAt: U };
const usd: Account = { id: "A2", name: "Bank B", currency: "USD", openingBalance: 100000, rate: "56", updatedAt: U };
const card: Account = { id: "C1", name: "Card A", currency: "PHP", openingBalance: -30000, type: "card", statementDay: 15, dueDays: 25, limit: 10000000, updatedAt: U };
const bankFields = { name: "Bank A", currency: "PHP", opening: "50000.00", rate: "" };
const cardFields = { name: "Card A", day: "15", dueDays: "25", limit: "100000.00", owed: "300.00" };

describe("accountEdit", () => {
  it("saves nothing when no field changed", () => {
    expect(accountEdit(bank, bankFields, "PHP")).toBeUndefined();
    expect(accountEdit(usd, { name: "Bank B", currency: "USD", opening: "1000.00", rate: "56" }, "PHP")).toBeUndefined();
  });
  it("treats an empty rate and no rate as the same", () => {
    expect(accountEdit(bank, { ...bankFields, rate: "" }, "PHP")).toBeUndefined();
    expect(accountEdit(bank, { ...bankFields, rate: "  " }, "PHP")).toBeUndefined();
  });
  it("treats -0 as no change for a zero opening balance", () => {
    expect(accountEdit({ ...bank, openingBalance: 0 }, { ...bankFields, opening: "-0" }, "PHP")).toBeUndefined();
  });
  it("builds the same account as before for each changed field", () => {
    expect(accountEdit(bank, { ...bankFields, name: " Bank C " }, "PHP")).toEqual({ account: { ...bank, name: "Bank C", rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, name: "  " }, "PHP")).toEqual({ account: { ...bank, name: "Account", rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, opening: "-200.50" }, "PHP")).toEqual({ account: { ...bank, openingBalance: -20050, rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, currency: "USD", rate: "57.5" }, "PHP")).toEqual({ account: { ...bank, currency: "USD", openingBalance: 5000000, rate: "57.5" } });
    expect(accountEdit(usd, { name: "Bank B", currency: "USD", opening: "1000.00", rate: "58" }, "PHP")).toEqual({ account: { ...usd, rate: "58" } });
  });
  it("drops a rate that is not a number, as before", () => {
    expect(accountEdit(usd, { name: "Bank B", currency: "USD", opening: "1000.00", rate: "abc" }, "PHP")).toEqual({ account: { ...usd, rate: undefined } });
  });
  it("returns an error for a balance that is not a number", () => {
    expect(accountEdit(bank, { ...bankFields, opening: "abc" }, "PHP")).toEqual({ error: "Enter a valid balance" });
  });
});

describe("cardEdit", () => {
  it("saves nothing when no field changed", () => {
    expect(cardEdit(card, cardFields, "PHP")).toBeUndefined();
  });
  it("keeps the checks and their order", () => {
    expect(cardEdit(card, { ...cardFields, day: "0", dueDays: "99", limit: "x" }, "PHP")).toEqual({ error: "Cut-off day is 1 to 31" });
    expect(cardEdit(card, { ...cardFields, day: "32" }, "PHP")).toEqual({ error: "Cut-off day is 1 to 31" });
    expect(cardEdit(card, { ...cardFields, dueDays: "61", limit: "x" }, "PHP")).toEqual({ error: "Due is 0 to 60 days after the cut-off" });
    expect(cardEdit(card, { ...cardFields, limit: "x", owed: "y" }, "PHP")).toEqual({ error: "Enter a valid limit" });
    expect(cardEdit(card, { ...cardFields, owed: "y" }, "PHP")).toEqual({ error: "Enter a valid amount owed" });
  });
  it("builds the same card as before for each changed field", () => {
    expect(cardEdit(card, { ...cardFields, day: "20" }, "PHP")).toEqual({ account: { ...card, statementDay: 20, rate: undefined } });
    expect(cardEdit(card, { ...cardFields, dueDays: "21" }, "PHP")).toEqual({ account: { ...card, dueDays: 21, rate: undefined } });
    expect(cardEdit(card, { ...cardFields, limit: "" }, "PHP")).toEqual({ account: { ...card, limit: undefined, rate: undefined } });
    expect(cardEdit(card, { ...cardFields, owed: "" }, "PHP")).toEqual({ account: { ...card, openingBalance: 0, rate: undefined } });
  });
  it("a colour tap is a change", () => {
    expect(cardEdit(card, cardFields, "PHP", { color: "green" })).toEqual({ account: { ...card, color: "green", rate: undefined } });
  });
  it("typing a name and then tapping a colour saves the typed name", () => {
    // The tap comes before the name field's blur has saved; the row's current fields carry the name.
    expect(cardEdit(card, { ...cardFields, name: "Card B" }, "PHP", { color: "purple" })).toEqual({ account: { ...card, name: "Card B", color: "purple", rate: undefined } });
  });
});

describe("sameAccount", () => {
  it("ignores key order and undefined keys", () => {
    expect(sameAccount(bank, { updatedAt: U, type: "bank", openingBalance: 5000000, currency: "PHP", name: "Bank A", id: "A1", rate: undefined })).toBe(true);
    expect(sameAccount(bank, { ...bank, name: "Bank B" })).toBe(false);
  });
});
