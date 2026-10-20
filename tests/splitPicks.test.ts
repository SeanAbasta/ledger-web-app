import { beforeEach, describe, expect, it } from "vitest";
import { list, listAll, remove, upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import type { Person, Split } from "../src/data/schema";
import { addName, hasName, keptKey, namesOf, payerAfter, payerForMode, resolveNames, splitFormOf, splitFromForm, toggleName } from "../src/data/splitForm";

const person = (id: string, name: string): Person => ({ id, name, updatedAt: "2026-10-01T00:00:00Z" });
const kept = [{ id: "K1", name: "Sam" }];

describe("picking people by tapping", () => {
  it("reads the picked names trimmed, without empties or case duplicates", () => {
    expect(namesOf(" Alex, ,jordan , ALEX,Sam,")).toEqual(["Alex", "jordan", "Sam"]);
    expect(namesOf("")).toEqual([]);
    expect(hasName("Alex, Jordan", " jordan ")).toBe(true);
    expect(hasName("Alex", "Al")).toBe(false);
  });

  it("toggles a name in and out in any case and keeps the order of taps", () => {
    let n = "";
    n = toggleName(n, "Sam");
    n = toggleName(n, "Alex");
    expect(n).toBe("Sam, Alex");
    expect(toggleName(n, "sam")).toBe("Alex");
    expect(toggleName(toggleName(n, "SAM"), "Sam")).toBe("Alex, Sam");
  });

  it("adds a typed name with the live spelling, never takes one out, and refuses empty or comma names", () => {
    const people = [person("a", "Alex")];
    expect(addName("", " alex ", people)).toBe("Alex");
    expect(addName("Alex", "ALEX", people)).toBe("Alex");
    expect(addName("Alex", "Taylor", people)).toBe("Alex, Taylor");
    expect(addName("Alex", "  ", people)).toBe("Alex");
    expect(addName("Alex", "Jo, Sam", people)).toBe("Alex");
  });
});

describe("Paid by when people change", () => {
  it("goes back to me when the payer is taken out, except in I owe", () => {
    for (const mode of ["they-owe", "half", "custom"] as const) expect(payerAfter("alex", mode, "Jordan", [])).toBe("me");
    expect(payerAfter("alex", "i-owe", "Jordan, Sam", [])).toBe("jordan");
    expect(payerAfter("alex", "i-owe", "", kept)).toBe(keptKey("K1"));
    expect(payerAfter("alex", "i-owe", "", [])).toBe("me");
  });

  it("stays when it is me, a kept person or still picked", () => {
    expect(payerAfter("me", "i-owe", "Alex", [])).toBe("me");
    expect(payerAfter("jordan", "half", "Alex, Jordan", [])).toBe("jordan");
    expect(payerAfter(keptKey("K1"), "half", "", kept)).toBe(keptKey("K1"));
  });

  it("switching to I owe moves Paid by off me as before", () => {
    expect(payerForMode("i-owe", "me", "Sam, Alex", [])).toBe("sam");
    expect(payerForMode("i-owe", "me", "", kept)).toBe(keptKey("K1"));
    expect(payerForMode("i-owe", "alex", "Sam, Alex", [])).toBe("alex");
    expect(payerForMode("they-owe", "alex", "Alex", [])).toBe("alex"); // unchanged: Save says "You must be the payer"
  });
});

describe("saving after taps", () => {
  let store: LedgerStore;
  let n = 0;
  beforeEach(async () => {
    store = await LedgerStore.open(`picks-${n++}`);
  });

  it("does not save the custom amount of someone taken out", async () => {
    const people = [await upsert(store, "people", { name: "Alex" }), await upsert(store, "people", { name: "Jordan" })];
    const names = toggleName("Alex, Jordan", "Jordan");
    const named = await resolveNames(store, namesOf(names), people);
    const split = splitFromForm({ names, paidBy: "me", mode: "custom", custom: { alex: "300", jordan: "200" }, kept: [] }, named, 100000, "PHP");
    expect(split.shares).toEqual([{ personId: people[0]!.id, amount: 30000 }]);
  });

  it("taking out the payer in I owe saves the next person as payer", async () => {
    const people = [await upsert(store, "people", { name: "Alex" }), await upsert(store, "people", { name: "Jordan" })];
    const names = toggleName("Alex, Jordan", "alex");
    const paidBy = payerAfter("alex", "i-owe", names, []);
    const named = await resolveNames(store, namesOf(names), people);
    const split = splitFromForm({ names, paidBy, mode: "i-owe", custom: {}, kept: [] }, named, 50000, "PHP");
    expect(split).toEqual({ paidBy: people[1]!.id, mode: "i-owe", shares: [{ personId: "me", amount: 50000 }] });
  });

  it("a new name is a person only once saved, and tapping others off and on keeps a removed person", async () => {
    const alex = await upsert(store, "people", { name: "Alex" });
    const jordan = await upsert(store, "people", { name: "Jordan" });
    const sam = await upsert(store, "people", { name: "Sam" });
    const stored: Split = { paidBy: "me", mode: "they-owe", shares: [{ personId: alex.id, amount: 5000 }, { personId: jordan.id, amount: 5000 }, { personId: sam.id, amount: 5000 }] };
    await remove(store, "people", sam.id);
    const live = await list(store, "people");
    const f = splitFormOf(stored, "PHP", live, await listAll(store, "people"));
    f.names = toggleName(toggleName(f.names, "Jordan"), "Jordan");
    expect(splitFromForm(f, await resolveNames(store, namesOf(f.names), live), 15000, "PHP", { amount: 15000, split: stored })).toBe(stored);

    f.names = addName(f.names, "Taylor", live);
    expect((await list(store, "people")).map((p) => p.name)).toEqual(["Alex", "Jordan"]);
    const named = await resolveNames(store, namesOf(f.names), live);
    const split = splitFromForm(f, named, 20000, "PHP", { amount: 15000, split: stored });
    expect(split.shares.map((s) => s.personId)).toContain(sam.id);
    expect(split.shares).toHaveLength(4);
    expect((await list(store, "people")).map((p) => p.name).sort()).toEqual(["Alex", "Jordan", "Taylor"]);
  });
});

describe("Custom when someone else paid: my own share (You owe)", () => {
  const alex = person("P-ALEX", "Alex");
  const sam = person("P-SAM", "Sam");
  const people = [alex, sam];
  const f = (custom: Record<string, string>, paidBy = "alex") => ({ names: "Alex, Sam", paidBy, mode: "custom" as const, custom, kept: [] });

  it("saves my share and Sam's when Alex paid", () => {
    const split = splitFromForm(f({ me: "1000", sam: "500" }), people, 300000, "PHP");
    expect(split.paidBy).toBe(alex.id);
    expect(split.shares).toEqual([{ personId: sam.id, amount: 50000 }, { personId: "me", amount: 100000 }]);
  });

  it("my share of it is what I owe", async () => {
    const { myShare } = await import("../src/data/splits");
    const split = splitFromForm(f({ me: "1000", sam: "500" }), people, 300000, "PHP");
    expect(myShare(300000, split)).toBe(100000);
  });

  it("I owe Alex my share and Sam's share never touches me", async () => {
    const { personLines } = await import("../src/data/balances");
    const split = splitFromForm(f({ me: "1000", sam: "500" }), people, 300000, "PHP");
    const entry = { id: "E1", kind: "expense" as const, date: "2026-10-12", amount: 300000, currency: "PHP", category: "Food", note: "Dinner", split, createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z" };
    const items = [{ type: "entry" as const, date: entry.date, entry }];
    expect(personLines(alex.id, items).map((l) => l.amount)).toEqual([-100000]);
    expect(personLines(sam.id, items)).toEqual([]);
  });

  it("an empty You owe saves no share for me, as before", () => {
    expect(splitFromForm(f({ sam: "500" }), people, 300000, "PHP").shares).toEqual([{ personId: sam.id, amount: 50000 }]);
    expect(splitFromForm(f({ me: "", sam: "500" }), people, 300000, "PHP").shares).toEqual([{ personId: sam.id, amount: 50000 }]);
  });

  it("You owe plus the others over the amount is still refused", () => {
    expect(() => splitFromForm(f({ me: "2000", sam: "1500" }), people, 300000, "PHP")).toThrow("Custom shares exceed the amount");
  });

  it("opening and saving the entry unchanged keeps the stored split", () => {
    const stored = splitFromForm(f({ me: "1000", sam: "500" }), people, 300000, "PHP");
    const form = splitFormOf(stored, "PHP", people, people);
    expect(form.custom.me).toBe("1000.00");
    expect(splitFromForm(form, people, 300000, "PHP", { amount: 300000, split: stored })).toBe(stored);
  });

  it("a split I paid never gets a share for me", () => {
    const split = splitFromForm(f({ me: "1000", alex: "500" }, "me"), people, 300000, "PHP");
    expect(split.paidBy).toBe("me");
    expect(split.shares).toEqual([{ personId: alex.id, amount: 50000 }]);
  });
});
