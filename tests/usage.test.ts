import { describe, expect, it } from "vitest";
import { ledgerItems } from "../src/data/rules";
import type { Entry, Rule } from "../src/data/schema";
import { accountUsage, personUsage, usageText } from "../src/data/usage";

const entry = (e: Partial<Entry> & { id: string }): Entry =>
  ({ kind: "expense", date: "2026-10-01", amount: 1000, currency: "PHP", createdAt: "x", updatedAt: "x", ...e }) as Entry;
const rule = (r: Partial<Rule> & { id: string }): Rule =>
  ({ type: "recurring", kind: "expense", amount: 500, currency: "PHP", frequency: "monthly", start: "2026-09-01", updatedAt: "x", ...r }) as Rule;
const items = (entries: Entry[], rules: Rule[] = []) => ledgerItems(entries, rules, "0000-01-01", "2026-10-11");

describe("what refers to a person", () => {
  const entries = [
    entry({ id: "a", split: { paidBy: "me", mode: "half", shares: [{ personId: "alex", amount: 500 }] } }),
    entry({ id: "b", amount: 300, split: { paidBy: "alex", mode: "half", shares: [{ personId: "me", amount: 150 }] } }),
    entry({ id: "c", kind: "settlement", amount: 100, personId: "alex", direction: "in" }),
    entry({ id: "d", split: { paidBy: "me", mode: "half", shares: [{ personId: "alex", amount: 500 }] }, deleted: true }),
    entry({ id: "e", split: { paidBy: "me", mode: "half", shares: [{ personId: "jon", amount: 500 }] } }),
    entry({ id: "f" }),
  ];
  const rules = [
    rule({ id: "r1", split: { paidBy: "me", mode: "they-owe", shares: [{ personId: "alex", amount: 500 }] } }),
    rule({ id: "r2", split: { paidBy: "me", mode: "they-owe", shares: [{ personId: "alex", amount: 500 }] }, deleted: true }),
    rule({ id: "r3" }),
  ];

  it("counts live split entries, payer entries, settlements and plans", () => {
    const u = personUsage("alex", entries, rules, items(entries));
    expect(u.entries).toBe(3); // a, b, c; not the deleted one or Jon's
    expect(u.plans).toBe(1);
  });
  it("gives the balance per currency, positive when they owe me", () => {
    expect(personUsage("alex", entries, [], items(entries)).owed).toEqual({ PHP: 500 - 150 - 100 });
  });
  it("is negative when I owe them, and empty when settled or unused", () => {
    const owe = [entry({ id: "b", amount: 300, split: { paidBy: "alex", mode: "half", shares: [{ personId: "me", amount: 150 }] } })];
    expect(personUsage("alex", owe, [], items(owe)).owed).toEqual({ PHP: -150 });
    const settled = [entries[0]!, entry({ id: "s", kind: "settlement", amount: 500, personId: "alex", direction: "in" })];
    expect(personUsage("alex", settled, [], items(settled)).owed).toEqual({});
    expect(personUsage("nobody", entries, rules, items(entries))).toEqual({ entries: 0, plans: 0, owed: {} });
  });
});

describe("what refers to an account", () => {
  it("counts entries from or into it and plans, including later changes to a plan", () => {
    const entries = [
      entry({ id: "a", accountId: "bpi" }),
      entry({ id: "b", kind: "transfer", accountId: "bpi", toAccountId: "card" }),
      entry({ id: "c", kind: "transfer", accountId: "gcash", toAccountId: "bpi" }),
      entry({ id: "d", accountId: "bpi", deleted: true }),
      entry({ id: "e", accountId: "gcash" }),
    ];
    const rules = [
      rule({ id: "r1", accountId: "bpi" }),
      rule({ id: "r2", accountId: "gcash", revisions: [{ from: "2026-10-01", accountId: "bpi" }] }),
      rule({ id: "r3", accountId: "bpi", deleted: true }),
    ];
    expect(accountUsage("bpi", entries, rules)).toEqual({ entries: 3, plans: 2 });
    expect(accountUsage("other", entries, rules)).toEqual({ entries: 0, plans: 0 });
  });
});

describe("usage text", () => {
  it("reads naturally", () => {
    expect(usageText({ entries: 4, plans: 1 })).toBe("4 entries and 1 plan");
    expect(usageText({ entries: 1, plans: 0 })).toBe("1 entry");
    expect(usageText({ entries: 0, plans: 2 })).toBe("2 plans");
    expect(usageText({ entries: 0, plans: 0 })).toBe("");
  });
});
