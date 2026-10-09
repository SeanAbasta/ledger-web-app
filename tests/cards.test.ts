import { describe, expect, it } from "vitest";
import { accountBalances } from "../src/data/accounts";
import { forecast } from "../src/data/forecast";
import { cardStatus, cutoffIn, dueFor, lastCutoff, nextCutoff, prevCutoff } from "../src/data/cards";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry, Rule } from "../src/data/schema";
import { summarize } from "../src/data/summary";

const P = 100; // centavos per peso
const e = (id: string, date: string, pesos: number, extra: Partial<Entry> = {}): Entry => ({
  id, kind: "expense", date, amount: pesos * P, currency: "PHP", category: "Food", accountId: "C", createdAt: id, updatedAt: "x", ...extra,
});
const bank: Account = { id: "B", name: "BDO", currency: "PHP", openingBalance: 50000 * P, updatedAt: "x" };
// Cut-off on the 15th, due 20 days later, so the Nov 15 statement is due Dec 5.
const card: Account = { id: "C", name: "Visa", currency: "PHP", openingBalance: 0, type: "card", statementDay: 15, dueDays: 20, limit: 100000 * P, updatedAt: "x" };
const charges = [e("a", "2026-10-16", 1000), e("b", "2026-10-25", 1000), e("c", "2026-11-03", 1000, { category: "Shopping" }), e("d", "2026-11-15", 1000)];
const iphone: Rule = { id: "I", type: "installment", kind: "expense", amount: 3000 * P, total: 72000 * P, count: 24, currency: "PHP", category: "Shopping", note: "iPhone", accountId: "C", frequency: "monthly", start: "2026-10-20", updatedAt: "x" };
const pay = e("p", "2026-12-05", 7000, { kind: "transfer", accountId: "B", toAccountId: "C", category: "Card payment" });

const status = (today: string, entries: Entry[] = charges, c: Account = card) => cardStatus(c, ledgerItems(entries, [iphone], "0000-01-01", today), [iphone], today);

describe("cut-off and due dates", () => {
  it("clamps a cut-off on the 31st to the end of February, and back", () => {
    const c31 = { id: "x", statementDay: 31 };
    expect(cutoffIn(c31, "2027-02-10")).toBe("2027-02-28");
    expect(cutoffIn(c31, "2028-02-10")).toBe("2028-02-29");
    expect(nextCutoff(c31, "2027-02-28")).toBe("2027-03-31");
    expect(prevCutoff(c31, "2027-03-31")).toBe("2027-02-28"); // so the March cycle runs Mar 1 to Mar 31
    expect(lastCutoff(c31, "2027-03-15")).toBe("2027-02-28");
  });
  it("puts a charge on the cut-off day on that statement", () => {
    const c31: Account = { ...card, statementDay: 31 };
    const s = cardStatus(c31, ledgerItems([e("f", "2027-02-28", 500)], [], "0000-01-01", "2027-03-01"), [], "2027-03-01");
    expect([s.cutoff, s.statement, s.unbilled]).toEqual(["2027-02-28", 500 * P, 0]);
  });
  it("is due a number of days after the cut-off (25 by default), unless moved by hand", () => {
    expect(dueFor(card, "2026-11-15")).toBe("2026-12-05");
    expect(dueFor({ id: "x" }, "2026-11-15")).toBe("2026-12-10");
    expect(dueFor({ ...card, dueOverrides: { "2026-11-15": "2026-12-07" } }, "2026-11-15")).toBe("2026-12-07");
  });
});

describe("the example card", () => {
  it("Nov 15: statement 7,000 due Dec 5, credit left 24,000", () => {
    expect(status("2026-11-15")).toMatchObject({
      cutoff: "2026-11-15", due: "2026-12-05", statement: 7000 * P, remaining: 7000 * P, paid: false,
      unbilled: 0, futureInstallments: 69000 * P, creditLeft: 24000 * P,
    });
  });
  it("Dec 4, before paying: unbilled 3,000, credit left still 24,000", () => {
    expect(status("2026-12-04")).toMatchObject({ statement: 7000 * P, remaining: 7000 * P, unbilled: 3000 * P, futureInstallments: 66000 * P, creditLeft: 24000 * P });
  });
  it("Dec 5, after paying 7,000: paid, bank down 7,000, spending unchanged, credit left 31,000", () => {
    expect(status("2026-12-05", [...charges, pay])).toMatchObject({ statement: 7000 * P, remaining: 0, paid: true, unbilled: 3000 * P, creditLeft: 31000 * P });
    const items = (es: Entry[]) => ledgerItems(es, [iphone], "0000-01-01", "2026-12-05");
    expect(accountBalances([bank, card], items([...charges, pay]), "PHP").accounts[0]!.balance).toBe(43000 * P);
    expect(accountBalances([bank, card], items(charges), "PHP").accounts[0]!.balance).toBe(50000 * P);
    const spent = (es: Entry[]) => summarize(items(es), "PHP", "2026-10-01", "2026-12-31").total;
    expect(spent([...charges, pay])).toBe(spent(charges));
    expect(spent(charges)).toBe((4000 + 2 * 3000) * P); // the four swipes plus the Oct 20 and Nov 20 installments
  });
  it("a refund after the cut-off goes on the next statement", () => {
    const back = e("r", "2026-11-20", 500, { kind: "income", refund: true, refundOf: "c", category: "Shopping" });
    expect(status("2026-12-04", [...charges, back])).toMatchObject({ remaining: 7000 * P, unbilled: 2500 * P, creditLeft: 24500 * P });
  });
  it("a split paid by me goes on the card in full", () => {
    const split = e("s", "2026-11-25", 2000, { split: { paidBy: "me", mode: "half", shares: [{ personId: "m", amount: 1000 * P }] } });
    const theyPaid = e("t", "2026-11-26", 900, { split: { paidBy: "m", mode: "i-owe", shares: [{ personId: "me", amount: 900 * P }] } });
    expect(status("2026-12-04", [...charges, split, theyPaid]).unbilled).toBe((3000 + 2000) * P);
  });
  it("puts what was owed when the card was added on the first statement", () => {
    expect(status("2026-11-15", charges, { ...card, openingBalance: -2000 * P })).toMatchObject({ statement: 9000 * P, creditLeft: 22000 * P });
  });
  it("has no credit left without a limit, and skipped installments do not hold it", () => {
    expect(status("2026-11-15", charges, { ...card, limit: undefined }).creditLeft).toBeUndefined();
    const skipped = { ...iphone, skipped: ["2027-01-20"] };
    expect(cardStatus(card, ledgerItems(charges, [skipped], "0000-01-01", "2026-11-15"), [skipped], "2026-11-15").futureInstallments).toBe(66000 * P);
  });
});

describe("forecast with a card", () => {
  const run = (today: string, entries: Entry[], c: Account = card, rules: Rule[] = [iphone]) => {
    const start = accountBalances([bank, c], ledgerItems(entries, rules, "0000-01-01", today), "PHP").totalBase;
    return forecast({ start, today, base: "PHP", entries, rules, months: 4, accounts: [bank, c] });
  };

  it("takes card spending from the bank on the statement's due date, not on the swipe date", () => {
    const f = run("2026-11-16", charges);
    expect(f.months.map((m) => [m.month, m.cards])).toEqual([["2026-11-01", 0], ["2026-12-01", 7000 * P], ["2027-01-01", 3000 * P], ["2027-02-01", 3000 * P]]);
    expect(f.months[0]!.obligations).toBe(0); // the Nov 20 installment used to be here
    // Without the card the same installment would hit November.
    const asBank = run("2026-11-16", charges, { ...card, type: undefined });
    expect(asBank.months[0]!.obligations).toBe(3000 * P);
  });

  it("does not move when the bill is paid", () => {
    const before = run("2026-12-05", charges).months.map((m) => m.end);
    const after = run("2026-12-05", [...charges, pay]).months.map((m) => m.end);
    expect(after).toEqual(before);
    // Nothing more is due in December; the Dec 15 statement (the Nov 20 payment) is due Jan 4.
    expect(run("2026-12-05", [...charges, pay]).months.slice(0, 2).map((m) => m.cards)).toEqual([0, 3000 * P]);
  });

  it("follows a due date moved by hand", () => {
    const moved = { ...card, dueOverrides: { "2026-11-15": "2027-01-04" } };
    const f = run("2026-11-16", charges, moved);
    expect([f.months[1]!.cards, f.months[2]!.cards]).toEqual([0, 10000 * P]);
  });

  it("puts a split card charge on the bill in full, and a card refund is not income", () => {
    const split = e("s", "2026-11-25", 2000, { split: { paidBy: "me", mode: "half", shares: [{ personId: "m", amount: 1000 * P }] } });
    const back = e("r", "2026-11-26", 500, { kind: "income", refund: true, refundOf: "c", category: "Shopping" });
    const f = run("2026-11-30", [...charges, split, back], card, []);
    expect(f.months[1]!.cards).toBe(7000 * P - 3000 * P); // Nov 15 statement without the iPhone rule: 4,000 swipes
    expect(f.months[2]!.cards).toBe((2000 - 500) * P);
    expect(f.months.every((m) => m.income === 0 && m.noIncome)).toBe(true);
  });
});

describe("a plan that starts later", () => {
  // Made-up numbers: 48,000 over 24 monthly payments from Dec 8, entered on Oct 9.
  const card8: Account = { ...card, statementDay: 8, dueDays: 18, limit: 100000 * P };
  const plan = (accountId?: string): Rule => ({ id: "L", type: "installment", kind: "expense", amount: 2000 * P, total: 48000 * P, count: 24, currency: "PHP", category: "Shopping", accountId, frequency: "monthly", start: "2026-12-08", updatedAt: "x" });
  const today = "2026-10-09";
  const run = (r: Rule) => forecast({ start: 50000 * P, today, base: "PHP", entries: [], rules: [r], months: 3, accounts: [bank, card8] });

  it("with no account, it is not on the card and the bank pays it on its own date", () => {
    expect(cardStatus(card8, [], [plan()], today)).toMatchObject({ futureInstallments: 0, creditLeft: 100000 * P });
    expect(run(plan()).months[2]).toMatchObject({ obligations: 2000 * P, cards: 0 });
  });

  it("on the card, it holds the limit at once and lands on the Dec 8 statement, due Dec 26", () => {
    expect(cardStatus(card8, [], [plan("C")], today)).toMatchObject({ futureInstallments: 48000 * P, creditLeft: 52000 * P });
    expect(dueFor(card8, "2026-12-08")).toBe("2026-12-26");
    expect(run(plan("C")).months[2]).toMatchObject({ obligations: 0, cards: 2000 * P });
    expect(summarize(ledgerItems([], [plan("C")], "0000-01-01", today), "PHP", "2026-10-01", "2026-10-31").total).toBe(0);
  });
});
