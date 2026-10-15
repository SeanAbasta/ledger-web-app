// Moving what points at one account to another, so an account can be removed (or a removed one
// cleaned up) without its entries and plans landing in "Other". Everything happens in one
// transaction, and every changed entry or rule gets a new updatedAt so merges carry it.
import type { DocMap, LedgerStore } from "./db";
import { isCard, type Account, type Defaults, type Entry, type Rule, type Settings } from "./schema";

export interface MoveResult {
  /** Entries that now point at the new account. */
  entries: number;
  /** Plans (recurring, installments, salary) that now point at it. */
  plans: number;
  /** Transfers left as they were because both ends would be the same account. */
  kept: number;
}

const now = () => new Date().toISOString();

function moveIn(docs: DocMap, months: string[], from: Set<string>, to: Account): MoveResult {
  const t = now();
  const out: MoveResult = { entries: 0, plans: 0, kept: 0 };
  for (const p of months) {
    const doc = docs.get(p);
    const entries = (doc?.entries as Entry[] | undefined) ?? [];
    let touched = false;
    const next = entries.map((e) => {
      if (e.deleted) return e;
      const a = e.accountId && from.has(e.accountId) ? to.id : e.accountId;
      const b = e.toAccountId && from.has(e.toAccountId) ? to.id : e.toAccountId;
      if (a === e.accountId && b === e.toAccountId) return e;
      if (e.kind === "transfer" && a === b) { out.kept++; return e; }
      touched = true;
      out.entries++;
      return { ...e, accountId: a, ...(e.toAccountId !== undefined ? { toAccountId: b } : {}), updatedAt: t };
    });
    if (touched) docs.set(p, { ...doc, entries: next });
  }
  const rulesDoc = docs.get("rules.json");
  const rules = (rulesDoc?.rules as Rule[] | undefined) ?? [];
  let rulesTouched = false;
  const nextRules = rules.map((r) => {
    if (r.deleted) return r;
    const hit = (id?: string) => !!id && from.has(id);
    if (!hit(r.accountId) && !(r.revisions ?? []).some((x) => hit(x.accountId))) return r;
    rulesTouched = true;
    out.plans++;
    return {
      ...r,
      ...(hit(r.accountId) ? { accountId: to.id } : {}),
      ...(r.revisions ? { revisions: r.revisions.map((x) => (hit(x.accountId) ? { ...x, accountId: to.id } : x)) } : {}),
      updatedAt: t,
    };
  });
  if (rulesTouched) docs.set("rules.json", { ...rulesDoc, rules: nextRules });
  // Defaults follow too. Income and card payments come from a bank, so a card never takes those.
  const settings = docs.get("settings.json") as (Partial<Settings> & Record<string, unknown>) | undefined;
  const d = settings?.defaults;
  if (settings && d) {
    const kinds: (keyof Defaults)[] = isCard(to) ? ["expense"] : ["expense", "income", "cardPayment"];
    const patch: Defaults = {};
    for (const k of kinds) if (typeof d[k] === "string" && from.has(d[k] as string)) (patch as Record<string, string>)[k] = to.id;
    if (Object.keys(patch).length) docs.set("settings.json", { ...settings, defaults: { ...d, ...patch } });
  }
  return out;
}

async function run(store: LedgerStore, fromIds: string[], toId: string, tombstone?: string): Promise<MoveResult> {
  const months = (await store.paths()).filter((p) => p.startsWith("months/"));
  let result: MoveResult = { entries: 0, plans: 0, kept: 0 };
  await store.transact([...months, "rules.json", "settings.json", "accounts.json"], (docs) => {
    const accountsDoc = docs.get("accounts.json");
    const accounts = (accountsDoc?.accounts as Account[] | undefined) ?? [];
    const to = accounts.find((a) => a.id === toId && !a.deleted);
    if (!to) throw new Error("Pick an account that still exists");
    if (fromIds.includes(toId)) throw new Error("Pick a different account");
    result = moveIn(docs, months, new Set(fromIds), to);
    if (tombstone) {
      docs.set("accounts.json", { ...accountsDoc, accounts: accounts.map((a) => (a.id === tombstone ? { ...a, deleted: true as const, updatedAt: now() } : a)) });
    }
  });
  return result;
}

/** Point every live entry, plan and default that uses one of `fromIds` at `toId` instead. */
export const reassignAccounts = (store: LedgerStore, fromIds: string[], toId: string) => run(store, fromIds, toId);

/** Move everything on `fromId` to `toId`, then remove `fromId`, all or nothing. */
export const moveAndRemove = (store: LedgerStore, fromId: string, toId: string) => run(store, [fromId], toId, fromId);
