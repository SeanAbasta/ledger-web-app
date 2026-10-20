import { describe, expect, it } from "vitest";
import { afterSave, opensLedger, savedLine, type ExpenseFields, type IncomeFields, type TransferFields } from "../src/features/add/afterSave";

const TODAY = "2026-10-20";

const expense: ExpenseFields = {
  form: "expense",
  amount: "3000",
  note: "Dinner",
  date: "2026-10-18",
  accountId: "card-a",
  category: "Food",
  type: "installment",
  freq: "weekly",
  count: "6",
  end: "2026-12-31",
  nextBill: true,
  split: true,
  names: "Alex, Sam",
  newName: "Sam",
  mode: "custom",
  paidBy: "alex",
  custom: { alex: "1000", me: "500" },
  kept: [{ id: "p1", name: "Sam" }],
};

describe("afterSave", () => {
  it("resets the expense form but keeps account and category", () => {
    expect(afterSave(expense, TODAY)).toEqual({
      form: "expense",
      amount: "",
      note: "",
      date: TODAY,
      accountId: "card-a",
      category: "Food",
      type: "one-off",
      freq: "monthly",
      count: "12",
      end: "",
      nextBill: false,
      split: false,
      names: "",
      newName: "",
      mode: "half",
      paidBy: "me",
      custom: {},
      kept: [],
    });
  });
  it("resets income amount, note and date and keeps category and account", () => {
    const f: IncomeFields = { form: "income", amount: "500", note: "Laptop", date: "2026-10-01", accountId: "bank-a", category: "Sale" };
    expect(afterSave(f, TODAY)).toEqual({ form: "income", amount: "", note: "", date: TODAY, accountId: "bank-a", category: "Sale" });
  });
  it("resets transfer amount, note and date and keeps From and To", () => {
    const f: TransferFields = { form: "transfer", amount: "2000", note: "Coffee", date: "2026-10-25", from: "bank-a", to: "bank-b" };
    expect(afterSave(f, TODAY)).toEqual({ form: "transfer", amount: "", note: "", date: TODAY, from: "bank-a", to: "bank-b" });
  });
  it("does not change the fields it was given", () => {
    const copy = structuredClone(expense);
    afterSave(expense, TODAY);
    expect(expense).toEqual(copy);
  });
});

describe("savedLine", () => {
  it("names the note and the amount", () => {
    expect(savedLine({ note: "Coffee", category: "Food", amount: 25000, currency: "PHP", date: TODAY, today: TODAY })).toBe("Saved: Coffee ₱250.00");
  });
  it("falls back to the category without a note", () => {
    expect(savedLine({ note: "  ", category: "Food", amount: 25000, currency: "PHP", date: TODAY, today: TODAY })).toBe("Saved: Food ₱250.00");
  });
  it("shows the date only when it is not today", () => {
    expect(savedLine({ note: "Coffee", amount: 25000, currency: "PHP", date: "2026-10-25", today: TODAY })).toBe("Saved for Oct 25: Coffee ₱250.00");
    expect(savedLine({ note: "Taxi", amount: 30000, currency: "PHP", date: "2026-10-18", today: TODAY })).toBe("Saved for Oct 18: Taxi ₱300.00");
  });
});

describe("opensLedger", () => {
  it("is true only for a plan whose first payment is after today", () => {
    expect(opensLedger("installment", "2026-11-05", TODAY)).toBe(true);
    expect(opensLedger("recurring", "2026-10-21", TODAY)).toBe(true);
    expect(opensLedger("recurring", TODAY, TODAY)).toBe(false);
    expect(opensLedger("installment", "2026-09-01", TODAY)).toBe(false);
    expect(opensLedger("one-off", "2026-11-05", TODAY)).toBe(false);
  });
});
