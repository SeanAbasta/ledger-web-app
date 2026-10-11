import { beforeEach, describe, expect, it } from "vitest";
import { makeBundle } from "../src/data/bundle";
import { list, remove, upsert } from "../src/data/collections";
import { LedgerStore } from "../src/data/db";
import { exportBundle, importBundle, validateBundle } from "../src/data/exportImport";
import type { Account } from "../src/data/schema";
import { mergeDocs } from "../src/sync/merge";
import { CARD_COLORS, cardColor } from "../src/ui/cardColor";

const card = (id: string, extra: Partial<Account> = {}): Account => ({ id, name: id, currency: "PHP", openingBalance: 0, type: "card", statementDay: 8, updatedAt: "2026-10-11T00:00:00.000Z", ...extra });
const bank: Account = { id: "01A", name: "Bank A", currency: "PHP", openingBalance: 0, updatedAt: "2026-10-11T00:00:00.000Z" };

let store: LedgerStore;
let n = 0;
beforeEach(async () => { store = await LedgerStore.open(`cc-${n++}`); });

describe("card colours", () => {
  it("uses the picked colour, else the card's order among cards", () => {
    const a = card("01B"), b = card("01C"), c = card("01D", { color: "pink" });
    const all = [bank, c, b, a]; // file order does not matter, creation (id) order does; banks are not counted
    expect(cardColor(a, all)).toBe("blue");
    expect(cardColor(b, all)).toBe("green");
    expect(cardColor(c, all)).toBe("pink");
  });
  it("ignores removed cards and wraps around the palette", () => {
    const gone = card("01A0", { deleted: true });
    const cards = Array.from({ length: CARD_COLORS.length + 1 }, (_, i) => card(`01B${String(i).padStart(2, "0")}`));
    const all = [gone, ...cards];
    expect(cardColor(cards[0]!, all)).toBe("blue");
    expect(cardColor(cards[CARD_COLORS.length]!, all)).toBe("blue");
  });
  it("treats a colour this copy does not know like no colour", () => {
    expect(cardColor(card("01B", { color: "aurora" }), [card("01B", { color: "aurora" })])).toBe("blue");
  });
  it("is accepted by import with or without it, and any string is fine", () => {
    const b = (accounts: unknown[]) => validateBundle(makeBundle({ "accounts.json": { accounts } } as never));
    expect(b([card("01B")])).toEqual([]);
    expect(b([card("01B", { color: "green" })])).toEqual([]);
    expect(b([card("01B", { color: "aurora" })])).toEqual([]);
    expect(b([{ ...card("01B"), color: 3 }])).toEqual(["accounts.json item 1: bad colour"]);
  });
  it("survives a sync merge, an edit that spreads the card (as older copies do), a removal and a backup", async () => {
    const merged = mergeDocs("accounts.json", { accounts: [card("01B", { color: "teal", updatedAt: "2026-10-12" })] }, { accounts: [card("01B", { updatedAt: "2026-10-11" })] });
    expect((merged.accounts as Account[])[0]!.color).toBe("teal");

    const saved = await upsert(store, "accounts", card("01B", { color: "orange" }));
    await upsert(store, "accounts", { ...saved, name: "Card A", limit: 5000000 }); // an older copy's Settings or due date edit
    expect((await list(store, "accounts"))[0]).toMatchObject({ name: "Card A", color: "orange" });

    const other = await LedgerStore.open(`cc-${n++}`);
    await importBundle(other, await exportBundle(store));
    expect((await list(other, "accounts"))[0]!.color).toBe("orange");

    await remove(store, "accounts", saved.id);
    expect(((await store.get<{ accounts: Account[] }>("accounts.json"))!.accounts[0])).toMatchObject({ deleted: true, color: "orange" });
  });
});
