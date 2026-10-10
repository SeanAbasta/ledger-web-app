import { describe, expect, it } from "vitest";
import { makeBundle } from "../src/data/bundle";
import { billDate, canBillNext, cardBreakdown, cardStatus, cutoffFor, type CardLine } from "../src/data/cards";
import { LedgerStore } from "../src/data/db";
import { validateBundle } from "../src/data/exportImport";
import { forecast } from "../src/data/forecast";
import { addEntry, listMonth, updateEntry } from "../src/data/months";
import { ledgerItems } from "../src/data/rules";
import type { Account, Entry } from "../src/data/schema";

const P = 100;
const e = (id: string, date: string, pesos: number, extra: Partial<Entry> = {}): Entry => ({
  id, kind: "expense", date, amount: pesos * P, currency: "PHP", category: "Food", accountId: "C", createdAt: id, updatedAt: "x", ...extra,
});
const bank: Account = { id: "B", name: "Bank", currency: "PHP", openingBalance: 50000 * P, updatedAt: "x" };
// Made-up card: cut-off on the 8th, due 18 days later, so the Oct 8 statement is due Oct 26.
const card: Account = { id: "C", name: "Visa", currency: "PHP", openingBalance: 0, type: "card", statementDay: 8, dueDays: 18, limit: 100000 * P, updatedAt: "x" };
const base = [e("a", "2026-10-07", 1000), e("b", "2026-10-08", 400), e("c", "2026-10-08", 600), e("d", "2026-10-09", 300)];
const moveB = (es: Entry[]) => es.map((x) => (x.id === "b" ? { ...x, nextBill: true as const } : x));
const pay = (id: string, date: string, pesos: number) => e(id, date, pesos, { kind: "transfer", accountId: "B", toAccountId: "C", category: "Card payment" });

const status = (today: string, es: Entry[], c: Account = card) => cardStatus(c, ledgerItems(es, [], "0000-01-01", today), [], today);
const owed = (s: ReturnType<typeof status>) => s.remaining + s.unbilled;
const total = (ls: CardLine[]) => ls.reduce((n, l) => n + l.amount, 0);

describe("bill on next statement: which statement a charge lands on", () => {
  it("a charge's cut-off is the first one on or after its date", () => {
    expect(cutoffFor(card, "2026-10-08")).toBe("2026-10-08");
    expect(cutoffFor(card, "2026-10-09")).toBe("2026-11-08");
    expect(billDate(card, "2026-10-08", true)).toBe("2026-10-09");
    expect(billDate(card, "2026-10-08")).toBe("2026-10-08");
  });
  it("is offered on the cut-off day and the 2 days before only", () => {
    expect(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => canBillNext(card, d))).toEqual([false, true, true, true, false]);
  });
  it("month ends: cut-off days 29 to 31 clamp in short months, and a moved charge lands on the next cycle", () => {
    const c29 = { id: "x", statementDay: 29 }, c30 = { id: "x", statementDay: 30 }, c31 = { id: "x", statementDay: 31 };
    expect(billDate(c31, "2027-01-31", true)).toBe("2027-02-01"); // on the Feb 28 statement
    expect(cutoffFor(c31, "2027-02-01")).toBe("2027-02-28");
    expect(billDate(c31, "2027-02-28", true)).toBe("2027-03-01"); // Feb 28 is that month's cut-off
    expect(cutoffFor(c31, "2027-03-01")).toBe("2027-03-31");
    expect(billDate(c29, "2027-02-27", true)).toBe("2027-03-01"); // the 29th clamps to Feb 28
    expect(cutoffFor(c29, "2027-03-01")).toBe("2027-03-29");
    expect(billDate(c30, "2028-02-29", true)).toBe("2028-03-01"); // leap year: the 30th clamps to Feb 29
    expect(billDate(c30, "2027-04-30", true)).toBe("2027-05-01");
    expect([canBillNext(c31, "2027-02-26"), canBillNext(c31, "2027-02-25"), canBillNext(c29, "2027-02-26"), canBillNext(c30, "2028-02-27")]).toEqual([true, false, true, true]);
  });
  it("month end on a real card: a moved Feb 28 charge is unbilled on Mar 1, not on the Feb 28 statement", () => {
    const c31: Account = { ...card, statementDay: 31 };
    const es = [e("j", "2027-02-10", 500), e("k", "2027-02-28", 200, { nextBill: true })];
    expect(status("2027-03-01", es, c31)).toMatchObject({ cutoff: "2027-02-28", statement: 500 * P, unbilled: 200 * P });
    expect(owed(status("2027-03-01", es, c31))).toBe(700 * P);
  });
});

describe("bill on next statement: the card numbers", () => {
  it("moving a charge on the cut-off day: Due drops by it, Unbilled rises by it, total owed and credit left stay", () => {
    const before = status("2026-10-10", base);
    const after = status("2026-10-10", moveB(base));
    expect([before.statement, before.unbilled, before.creditLeft]).toEqual([2000 * P, 300 * P, 97700 * P]);
    expect(after.remaining).toBe(before.remaining - 400 * P);
    expect(after.unbilled).toBe(before.unbilled + 400 * P);
    expect(owed(after)).toBe(owed(before));
    expect(after.creditLeft).toBe(before.creditLeft);
    expect([after.cutoff, after.due]).toEqual([before.cutoff, before.due]);
  });
  it("on the cut-off day itself (the moved charge's bill date is tomorrow), total owed still stays", () => {
    const before = status("2026-10-08", base);
    const after = status("2026-10-08", moveB(base));
    expect([after.statement, after.unbilled]).toEqual([before.statement - 400 * P, 400 * P]);
    expect(owed(after)).toBe(owed(before));
    expect(after.creditLeft).toBe(before.creditLeft);
  });
  it("the per-card view lists a moved charge under Unbilled, and every list still adds up", () => {
    const es = moveB(base);
    const items = ledgerItems(es, [], "0000-01-01", "2026-10-10");
    const st = cardStatus(card, items, [], "2026-10-10");
    const bd = cardBreakdown(card, items, "2026-10-10");
    expect(bd.unbilled.map((l) => l.item?.type === "entry" && l.item.entry.id)).toEqual(["b", "d"]);
    expect(total(bd.statement)).toBe(st.statement);
    expect(total(bd.unbilled)).toBe(st.unbilled);
  });
  it("paid before moving: the statement is paid, the extra shows as paid ahead, total owed stays", () => {
    const paid = [...base, pay("p", "2026-10-10", 2000)];
    const before = status("2026-10-10", paid);
    const after = status("2026-10-10", moveB(paid));
    expect([before.remaining, before.unbilled]).toEqual([0, 300 * P]);
    expect(after).toMatchObject({ statement: 1600 * P, remaining: 0, paid: true, unbilled: 300 * P, creditLeft: before.creditLeft });
    const bd = cardBreakdown(card, ledgerItems(moveB(paid), [], "0000-01-01", "2026-10-10"), "2026-10-10");
    expect(bd.unbilled.map((l) => [l.kind, l.amount / P])).toEqual([["charge", 400], ["charge", 300], ["ahead", -400]]);
  });
  it("paid after moving: paying the smaller statement leaves the moved charge unbilled; Pay all clears everything", () => {
    const moved = moveB(base);
    const st = status("2026-10-10", [...moved, pay("p", "2026-10-10", 1600)]);
    expect(st).toMatchObject({ remaining: 0, paid: true, unbilled: 700 * P, creditLeft: 99300 * P });
    const all = status("2026-10-10", moved);
    expect(all.remaining + all.unbilled).toBe(2300 * P);
    expect(status("2026-10-10", [...moved, pay("p", "2026-10-10", 2300)])).toMatchObject({ remaining: 0, unbilled: 0, creditLeft: 100000 * P });
  });
});

describe("bill on next statement: forecast", () => {
  const run = (es: Entry[], today = "2026-10-10") => forecast({ start: 50000 * P, today, base: "PHP", entries: es, rules: [], months: 3, accounts: [bank, card] });
  it("the moved charge leaves the bank with the next bill; the total does not change", () => {
    const before = run(base).months.map((m) => m.cards);
    const after = run(moveB(base)).months.map((m) => m.cards);
    expect(before).toEqual([2000 * P, 300 * P, 0]); // Oct 8 statement due Oct 26, Nov 8 statement due Nov 26
    expect(after).toEqual([1600 * P, 700 * P, 0]);
    expect(run(moveB(base)).months[2]!.end).toBe(run(base).months[2]!.end);
  });
  it("a future-dated charge marked for the next bill goes on the statement after", () => {
    const es = [e("f", "2026-11-07", 500, { nextBill: true })];
    expect(run(es).months.map((m) => m.cards)).toEqual([0, 0, 500 * P]); // Dec 8 statement, due Dec 26
  });
});

describe("bill on next statement: older copies and backups", () => {
  it("backups with the flag are accepted; a malformed flag is not", () => {
    const b = (x: Entry | Record<string, unknown>) => validateBundle(makeBundle({ "months/2026-10.json": { month: "2026-10", entries: [x] } } as never));
    expect(b(e("b", "2026-10-08", 400, { nextBill: true }))).toEqual([]);
    expect(b(e("b", "2026-10-08", 400))).toEqual([]);
    expect(b({ ...e("b", "2026-10-08", 400), nextBill: "yes" })[0]).toMatch(/bad nextBill/);
  });
  it("an edit that does not mention the flag keeps it (as an older copy's edit form does); clearing it removes it", async () => {
    const store = await LedgerStore.open("next-bill-1");
    const x = await addEntry(store, { kind: "expense", date: "2026-10-08", amount: 400 * P, currency: "PHP", category: "Food", accountId: "C", nextBill: true });
    await updateEntry(store, "2026-10", x.id, { note: "edited elsewhere" });
    expect((await listMonth(store, "2026-10"))[0]).toMatchObject({ nextBill: true, note: "edited elsewhere" });
    await updateEntry(store, "2026-10", x.id, { nextBill: undefined });
    expect((await listMonth(store, "2026-10"))[0]!.nextBill).toBeUndefined();
  });
});
