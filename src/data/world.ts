import { getSettings, list } from "./collections";
import type { LedgerStore } from "./db";
import { loadAllEntries } from "./months";
import { ledgerItems, type LedgerItem } from "./rules";
import type { Account, Entry, Person, Rule, Settings } from "./schema";

/** Everything the screens derive from, loaded once per refresh. */
export interface World {
  settings: Settings;
  base: string;
  entries: Entry[];
  rules: Rule[];
  accounts: Account[];
  people: Person[];
}

export async function loadWorld(store: LedgerStore): Promise<World> {
  const [settings, entries, rules, accounts, people] = await Promise.all([
    getSettings(store),
    loadAllEntries(store),
    list(store, "rules"),
    list(store, "accounts"),
    list(store, "people"),
  ]);
  return { settings, base: settings.baseCurrency, entries, rules, accounts, people };
}

/** Everything that has happened up to and including `today`. */
export const itemsToDate = (w: Pick<World, "entries" | "rules">, today: string): LedgerItem[] =>
  ledgerItems(w.entries, w.rules, "0000-01-01", today);
