// The last account and category used per kind of entry. Per device on purpose (owner's choice):
// remembering it never writes settings.json, so saving an entry does not add a sync change.
import type { LastUsed } from "../data/defaults";

const KEY = "ledger.lastUsed";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const ls = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function loadLastUsed(s: Storage | undefined = ls()): LastUsed {
  try {
    const v: unknown = JSON.parse(s?.getItem(KEY) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) as LastUsed;
  } catch {
    return {};
  }
}

/** Merges into what is stored; empty values are ignored. Fails quietly when storage is blocked. */
export function rememberUsed(patch: LastUsed, s: Storage | undefined = ls()): void {
  try {
    const add = Object.fromEntries(Object.entries(patch).filter(([, x]) => !!x));
    s?.setItem(KEY, JSON.stringify({ ...loadLastUsed(s), ...add }));
  } catch {
    // storage blocked: defaults still work
  }
}
