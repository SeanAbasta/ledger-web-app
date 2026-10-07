import type { Doc } from "../data/db";

type Item = { id: string; updatedAt: string };

function mergeById<T extends Item>(local: T[], remote: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of remote) m.set(x.id, x);
  for (const x of local) {
    const r = m.get(x.id);
    if (!r || x.updatedAt >= r.updatedAt) m.set(x.id, x); // newest edit wins; a tie keeps this device's
  }
  return [...m.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Merge one data file entry by entry. Deletes are tombstones, so they win only if they are newer. */
export function mergeDocs(path: string, local: Doc | undefined, remote: Doc | undefined): Doc {
  if (!local) return remote!;
  if (!remote) return local;
  if (path.startsWith("months/")) {
    return { ...remote, ...local, entries: mergeById((local.entries as Item[]) ?? [], (remote.entries as Item[]) ?? []) };
  }
  if (path === "settings.json") {
    const cats = [...new Set([...((remote.categories as string[]) ?? []), ...((local.categories as string[]) ?? [])])];
    return { ...remote, ...local, categories: cats };
  }
  for (const key of ["people", "accounts", "rules"]) {
    if (path === `${key}.json`) return { [key]: mergeById((local[key] as Item[]) ?? [], (remote[key] as Item[]) ?? []) };
  }
  return local;
}
