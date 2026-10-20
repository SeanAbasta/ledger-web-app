import { describe, expect, it } from "vitest";
import type { Person, Split, SplitMode } from "../src/data/schema";
import { keptKey, splitFormOf, type SplitFormState } from "../src/data/splitForm";
import { modeAfterPayer, modesFor, splitPreview } from "../src/features/add/splitPreview";

const person = (id: string, name: string): Person => ({ id, name, updatedAt: "2026-10-01T00:00:00Z" });
const alex = person("P-ALEX", "Alex");
const sam = person("P-SAM", "Sam");
const people = [alex, sam];
const form = (f: Partial<SplitFormState>): SplitFormState => ({ names: "Alex", paidBy: "me", mode: "half", custom: {}, kept: [], ...f });
const lines = (p: ReturnType<typeof splitPreview>) => (p && "lines" in p ? p.lines : p);

describe("modesFor and modeAfterPayer", () => {
  it("offers They owe when I paid and I owe when someone else did", () => {
    expect(modesFor("me")).toEqual(["half", "they-owe", "custom"]);
    expect(modesFor("alex")).toEqual(["half", "i-owe", "custom"]);
    expect(modesFor(keptKey("K1"))).toEqual(["half", "i-owe", "custom"]);
  });
  it("swaps They owe and I owe when the payer changes, and keeps Even and Custom", () => {
    const all: SplitMode[] = ["they-owe", "i-owe", "half", "custom"];
    const mine = all.map((m) => modeAfterPayer(m, "me"));
    const theirs = all.map((m) => modeAfterPayer(m, "alex"));
    expect(mine).toEqual(["they-owe", "they-owe", "half", "custom"]);
    expect(theirs).toEqual(["i-owe", "i-owe", "half", "custom"]);
    for (const m of all) {
      expect(modesFor("me")).toContain(modeAfterPayer(m, "me"));
      expect(modesFor("alex")).toContain(modeAfterPayer(m, "alex"));
    }
  });
});

describe("splitPreview", () => {
  it("shows nothing while the amount is empty", () => {
    expect(splitPreview(form({}), "", "PHP", people, "one-off", "12")).toBeUndefined();
    expect(splitPreview(form({}), "abc", "PHP", people, "one-off", "12")).toBeUndefined();
  });

  it("Even, I paid: each person owes me their part", () => {
    expect(lines(splitPreview(form({ names: "Alex, Sam" }), "3000", "PHP", people, "one-off", "12"))).toEqual(["Alex owes you ₱1,000.00", "Sam owes you ₱1,000.00"]);
  });

  it("They owe: the picked people cover all of it", () => {
    expect(lines(splitPreview(form({ names: "Alex", mode: "they-owe" }), "3000", "PHP", people, "one-off", "12"))).toEqual(["Alex owes you ₱3,000.00"]);
  });

  it("Custom, I paid", () => {
    expect(lines(splitPreview(form({ names: "Alex, Sam", mode: "custom", custom: { alex: "500", sam: "700" } }), "3000", "PHP", people, "one-off", "12"))).toEqual(["Alex owes you ₱500.00", "Sam owes you ₱700.00"]);
  });

  it("Even, Alex paid: I and Sam owe Alex", () => {
    expect(lines(splitPreview(form({ names: "Alex, Sam", paidBy: "alex" }), "3000", "PHP", people, "one-off", "12"))).toEqual(["You owe Alex ₱1,000.00", "Sam owes Alex ₱1,000.00"]);
  });

  it("I owe: all of it to the payer", () => {
    expect(lines(splitPreview(form({ names: "Alex", paidBy: "alex", mode: "i-owe" }), "3000", "PHP", people, "one-off", "12"))).toEqual(["You owe Alex ₱3,000.00"]);
  });

  it("Custom, Alex paid: my own share comes from the You owe field", () => {
    expect(lines(splitPreview(form({ names: "Alex, Sam", paidBy: "alex", mode: "custom", custom: { me: "1000", sam: "500" } }), "3000", "PHP", people, "one-off", "12"))).toEqual(["Sam owes Alex ₱500.00", "You owe Alex ₱1,000.00"]);
  });

  it("names a person not saved yet, without writing anything", () => {
    expect(lines(splitPreview(form({ names: "Alex, Sam" }), "3000", "PHP", [alex], "one-off", "12"))).toEqual(["Alex owes you ₱1,000.00", "Sam owes you ₱1,000.00"]);
  });

  it("names a removed person in the split as removed", () => {
    const f = form({ names: "Alex", kept: [{ id: "K1", name: "Sam" }] });
    expect(lines(splitPreview(f, "3000", "PHP", [alex], "one-off", "12"))).toEqual(["Alex owes you ₱1,000.00", "Sam (removed) owes you ₱1,000.00"]);
    expect(lines(splitPreview({ ...f, paidBy: keptKey("K1"), mode: "i-owe" }, "3000", "PHP", [alex], "one-off", "12"))).toEqual(["You owe Sam (removed) ₱3,000.00"]);
  });

  it("an installment shows each payment's split", () => {
    expect(lines(splitPreview(form({ names: "Alex" }), "12000", "PHP", people, "installment", "12"))).toEqual(["Alex owes you ₱500.00 each payment"]);
  });

  it("keeps a foreign split in its own currency", () => {
    expect(lines(splitPreview(form({ names: "Alex" }), "120", "USD", people, "one-off", "12"))).toEqual(["Alex owes you $60.00"]);
  });

  it("returns the errors as text instead of throwing", () => {
    expect(splitPreview(form({ names: "" }), "3000", "PHP", people, "one-off", "12")).toEqual({ error: "Pick at least one person" });
    expect(splitPreview(form({ names: "Alex", mode: "custom", custom: { alex: "4000" } }), "3000", "PHP", people, "one-off", "12")).toEqual({ error: "Custom shares exceed the amount" });
  });

  it("an unchanged edit shows the stored shares, spare centavos on the same people", () => {
    // Stored with the spare centavo on Sam, not on the first person as a fresh split would put it.
    const stored: Split = { paidBy: "me", mode: "half", shares: [{ personId: alex.id, amount: 3333 }, { personId: sam.id, amount: 3334 }] };
    const f = splitFormOf(stored, "PHP", people, people);
    expect(lines(splitPreview(f, "100.01", "PHP", people, "one-off", "12", { amount: 10001, split: stored }))).toEqual(["Alex owes you ₱33.33", "Sam owes you ₱33.34"]);
  });

  it("gives the same shares Save stores", async () => {
    const { splitFromForm } = await import("../src/data/splitForm");
    const f = form({ names: "Alex, Sam", paidBy: "alex", mode: "custom", custom: { me: "1000", sam: "500" } });
    const saved = splitFromForm(f, people, 300000, "PHP");
    expect(saved.shares).toEqual([{ personId: sam.id, amount: 50000 }, { personId: "me", amount: 100000 }]);
  });
});
