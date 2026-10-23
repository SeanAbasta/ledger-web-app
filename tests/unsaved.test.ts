import { describe, expect, it } from "vitest";
import { draftOf, isBlank, keep, noUnsaved, resume } from "../src/features/add/unsaved";
import type { ExpenseDraft, IncomeDraft } from "../src/features/add/draft";

const exp = (amount: string, note = ""): ExpenseDraft => ({ amount, note, date: "2026-10-23", accountId: "A", category: "Food", type: "one-off", freq: "monthly", count: "12", end: "", nextBill: false, split: false, names: "", newName: "", mode: "half", paidBy: "me", custom: {}, kept: [], currency: "PHP", rate: "" });
const inc = (amount: string): IncomeDraft => ({ amount, note: "", date: "2026-10-23", accountId: "A", category: "Gift" });

describe("unsaved: what was typed on Add and not saved", () => {
  it("a form with no amount and no note is blank", () => {
    expect(isBlank({ amount: "", note: "" })).toBe(true);
    expect(isBlank({ amount: " ", note: " " })).toBe(true);
    expect(isBlank({ amount: "5", note: "" })).toBe(false);
    expect(isBlank({ amount: "", note: "Taxi" })).toBe(false);
  });
  it("keeps what was typed and gives it back when Add opens again", () => {
    const u = keep(noUnsaved(), { kind: "Expense", fields: exp("250", "Taxi") });
    expect(resume(u)).toEqual({ kind: "Expense", fields: exp("250", "Taxi") });
  });
  it("resumes the kind that was edited last, and keeps the other kinds for when the person switches", () => {
    let u = keep(noUnsaved(), { kind: "Expense", fields: exp("250") });
    u = keep(u, { kind: "Income", fields: inc("900") });
    expect(resume(u)?.kind).toBe("Income");
    expect(draftOf(u, "Expense")?.fields).toEqual(exp("250"));
    expect(draftOf(u, "Transfer")).toBeUndefined();
  });
  it("a saved form is blank again: its slot empties, and an earlier kind becomes the one to resume", () => {
    let u = keep(noUnsaved(), { kind: "Expense", fields: exp("250") });
    u = keep(u, { kind: "Income", fields: inc("900") });
    u = keep(u, { kind: "Income", fields: undefined });
    expect(draftOf(u, "Income")).toBeUndefined();
    expect(resume(u)?.kind).toBe("Expense");
    u = keep(u, { kind: "Expense", fields: undefined });
    expect(resume(u)).toBeUndefined();
  });
  it("blanking a kind that was not the last leaves the last alone", () => {
    let u = keep(noUnsaved(), { kind: "Income", fields: inc("900") });
    u = keep(u, { kind: "Expense", fields: exp("1") });
    u = keep(u, { kind: "Income", fields: undefined });
    expect(resume(u)?.kind).toBe("Expense");
  });
});
