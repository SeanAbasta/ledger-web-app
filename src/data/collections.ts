import type { LedgerStore } from "./db";
import { DEFAULT_SETTINGS, type Account, type Person, type Rule, type Settings } from "./schema";
import { ulid } from "./ulid";

type Named = "people" | "accounts" | "rules";
type ItemOf = { people: Person; accounts: Account; rules: Rule };

const PATH: Record<Named, string> = {
  people: "people.json",
  accounts: "accounts.json",
  rules: "rules.json",
};

const now = () => new Date().toISOString();

export async function getSettings(store: LedgerStore): Promise<Settings> {
  const s = await store.get<Settings & Record<string, unknown>>("settings.json");
  return { ...DEFAULT_SETTINGS, ...(s as Partial<Settings> | undefined) };
}

export async function saveSettings(store: LedgerStore, patch: Partial<Settings>): Promise<void> {
  await store.transact(["settings.json"], (docs) => {
    const cur = { ...DEFAULT_SETTINGS, ...(docs.get("settings.json") as Partial<Settings> | undefined) };
    docs.set("settings.json", { ...cur, ...patch } as unknown as Record<string, unknown>);
  });
}

/** Live (non-deleted) items. */
export async function list<K extends Named>(store: LedgerStore, kind: K): Promise<ItemOf[K][]> {
  const doc = await store.get(PATH[kind]);
  const items = ((doc?.[kind] as ItemOf[K][] | undefined) ?? []) as (ItemOf[K] & { deleted?: true })[];
  return items.filter((i) => !i.deleted);
}

/** Every item, removed ones (tombstones) included, so something removed can still be named. */
export async function listAll<K extends Named>(store: LedgerStore, kind: K): Promise<(ItemOf[K] & { deleted?: true })[]> {
  const doc = await store.get(PATH[kind]);
  return ((doc?.[kind] as (ItemOf[K] & { deleted?: true })[] | undefined) ?? []);
}

/**
 * What to call a person or account in lists: its name, with "(removed)" after it once removed, or
 * `missing` when there is no record at all. Pass `listAll` items so removed ones can still be named.
 */
export function nameOf(id: string | undefined, all: { id: string; name: string; deleted?: true }[], missing: string): string {
  const x = id ? all.find((a) => a.id === id) : undefined;
  return !x ? missing : x.deleted ? `${x.name} (removed)` : x.name;
}

/** Insert or replace by id. Returns the stored item. */
export async function upsert<K extends Named>(
  store: LedgerStore,
  kind: K,
  item: Omit<ItemOf[K], "id" | "updatedAt"> & { id?: string },
): Promise<ItemOf[K]> {
  const saved = { ...item, id: item.id ?? ulid(), updatedAt: now() } as unknown as ItemOf[K] & { id: string };
  await store.transact([PATH[kind]], (docs) => {
    const arr = [...(((docs.get(PATH[kind])?.[kind] as { id: string }[] | undefined) ?? []))];
    const i = arr.findIndex((x) => x.id === saved.id);
    if (i >= 0) arr[i] = saved;
    else arr.push(saved);
    docs.set(PATH[kind], { [kind]: arr });
  });
  return saved;
}

/** Tombstone, so the delete survives a merge. */
export async function remove(store: LedgerStore, kind: Named, id: string): Promise<void> {
  await store.transact([PATH[kind]], (docs) => {
    const arr = ((docs.get(PATH[kind])?.[kind] as { id: string; deleted?: true; updatedAt: string }[] | undefined) ?? []).map(
      (x) => (x.id === id ? { ...x, deleted: true as const, updatedAt: now() } : x),
    );
    docs.set(PATH[kind], { [kind]: arr });
  });
}

/** Undo a removal: the same id comes back, so everything that still points at it reconnects. */
export async function restore(store: LedgerStore, kind: Named, id: string): Promise<void> {
  await store.transact([PATH[kind]], (docs) => {
    const arr = ((docs.get(PATH[kind])?.[kind] as { id: string; deleted?: true; updatedAt: string }[] | undefined) ?? []).map((x) => {
      if (x.id !== id || !x.deleted) return x;
      const { deleted: _, ...live } = x;
      return { ...live, updatedAt: now() };
    });
    docs.set(PATH[kind], { [kind]: arr });
  });
}
