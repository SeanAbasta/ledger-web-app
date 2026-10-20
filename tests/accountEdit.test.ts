import { describe, expect, it } from "vitest";
import type { Account } from "../src/data/schema";
import { accountEdit, accountFieldsOf, cardEdit, cardFieldsOf, freshFields, sameAccount } from "../src/features/settings/accountEdit";

const U = "2026-10-01T00:00:00Z";
const bank: Account = { id: "A1", name: "Bank A", currency: "PHP", openingBalance: 5000000, type: "bank", updatedAt: U };
const usd: Account = { id: "A2", name: "Bank B", currency: "USD", openingBalance: 100000, rate: "56", updatedAt: U };
const card: Account = { id: "C1", name: "Card", currency: "PHP", openingBalance: -30000, type: "card", statementDay: 15, dueDays: 25, limit: 10000000, updatedAt: U };
const bankFields = { name: "Bank A", currency: "PHP", opening: "50000.00", rate: "" };
const cardFields = { name: "Card", day: "15", dueDays: "25", limit: "100000.00", owed: "300.00" };

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
    expect(accountEdit(bank, { ...bankFields, name: " Bank B " }, "PHP")).toEqual({ account: { ...bank, name: "Bank B", rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, name: "  " }, "PHP")).toEqual({ account: { ...bank, name: "Account", rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, opening: "-200.00" }, "PHP")).toEqual({ account: { ...bank, openingBalance: -20000, rate: undefined } });
    expect(accountEdit(bank, { ...bankFields, currency: "USD", rate: "57" }, "PHP")).toEqual({ account: { ...bank, currency: "USD", openingBalance: 5000000, rate: "57" } });
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
    expect(cardEdit(card, { ...cardFields, name: "Card A" }, "PHP", { color: "purple" })).toEqual({ account: { ...card, name: "Card A", color: "purple", rate: undefined } });
  });
});

describe("sameAccount", () => {
  it("ignores key order and undefined keys", () => {
    expect(sameAccount(bank, { updatedAt: U, type: "bank", openingBalance: 5000000, currency: "PHP", name: "Bank A", id: "A1", rate: undefined })).toBe(true);
    expect(sameAccount(bank, { ...bank, name: "Bank B" })).toBe(false);
  });
});

describe("freshFields", () => {
  it("starts the rows from the stored account as before", () => {
    expect(accountFieldsOf(bank)).toEqual(bankFields);
    expect(accountFieldsOf(usd)).toEqual({ name: "Bank B", currency: "USD", opening: "1000.00", rate: "56" });
    expect(cardFieldsOf(card, "PHP")).toEqual(cardFields);
    expect(cardFieldsOf({ ...card, limit: undefined, openingBalance: 0, dueDays: undefined }, "PHP")).toEqual({ ...cardFields, limit: "", owed: "", dueDays: "25" });
  });
  it("takes every stored value when nothing is focused", () => {
    const local = { ...bankFields, name: "Old", opening: "1.00" };
    expect(freshFields(local, accountFieldsOf(bank), undefined)).toEqual(bankFields);
  });
  it("a change from another device replaces the fields not being edited", () => {
    const pulled = { ...bank, name: "Bank B", openingBalance: 6000000 };
    const local = { ...bankFields, rate: "" };
    expect(freshFields(local, accountFieldsOf(pulled), "rate")).toEqual({ ...bankFields, name: "Bank B", opening: "60000.00" });
  });
  it("the focused field keeps what is being typed", () => {
    const typing = { ...cardFields, name: "Card A", limit: "2000" };
    // The name was just saved (stored), the limit is still being typed.
    const stored = cardFieldsOf({ ...card, name: "Card A" }, "PHP");
    expect(freshFields(typing, stored, "limit")).toEqual({ ...cardFields, name: "Card A", limit: "2000" });
  });
});
