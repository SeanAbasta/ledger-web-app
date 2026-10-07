import { makeBundle, type Bundle } from "./bundle";
import type { Doc, LedgerStore } from "./db";
import { minorDigits } from "./money";
import type { Account, Entry, Person } from "./schema";
import { isDataPath } from "../sync/handoff";
import { mergeDocs } from "../sync/merge";

/** Every data file on this device, as one export. */
export async function exportBundle(store: LedgerStore): Promise<Bundle> {
  const docs = await store.allDocs();
  return makeBundle(Object.fromEntries(Object.entries(docs).filter(([p]) => isDataPath(p))));
}

const KINDS = ["expense", "income", "settlement"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function entryProblem(e: unknown): string | undefined {
  if (!isObj(e)) return "not an object";
  if (typeof e.id !== "string" || !e.id) return "missing id";
  if (!KINDS.includes(e.kind as string)) return "bad kind";
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "bad date";
  if (!Number.isInteger(e.amount) || (e.amount as number) <= 0) return "bad amount";
  if (typeof e.currency !== "string" || !/^[A-Za-z]{3}$/.test(e.currency)) return "bad currency";
  if (typeof e.updatedAt !== "string" || typeof e.createdAt !== "string") return "missing timestamps";
  if (e.rate !== undefined && (typeof e.rate !== "string" || !/^\d+(\.\d+)?$/.test(e.rate))) return "bad rate";
  return undefined;
}

/** Problems that make a file unsafe to import. An empty list means it is fine. */
export function validateBundle(b: Bundle): string[] {
  const out: string[] = [];
  for (const [path, doc] of Object.entries(b.files)) {
    if (!isDataPath(path)) { out.push(`${path}: not a Ledger file`); continue; }
    if (!isObj(doc)) { out.push(`${path}: not an object`); continue; }
    if (path.startsWith("months/")) {
      const month = path.slice(7, 14);
      if (!Array.isArray(doc.entries)) { out.push(`${path}: no entries list`); continue; }
      doc.entries.forEach((e, i) => {
        const p = entryProblem(e);
        if (p) out.push(`${path} entry ${i + 1}: ${p}`);
        else if (!(e as Entry).date.startsWith(month)) out.push(`${path} entry ${i + 1}: date is in another month`);
      });
    } else if (path !== "settings.json") {
      const key = path.slice(0, -5);
      const list = doc[key];
      if (!Array.isArray(list)) out.push(`${path}: no ${key} list`);
      else list.forEach((x, i) => { if (!isObj(x) || typeof x.id !== "string" || typeof x.updatedAt !== "string") out.push(`${path} item ${i + 1}: missing id or timestamp`); });
    } else if (doc.categories !== undefined && !(Array.isArray(doc.categories) && doc.categories.every((c) => typeof c === "string"))) {
      out.push("settings.json: bad categories");
    }
  }
  return out;
}

/**
 * Add the file's data to this device. Nothing is deleted: entries are merged by id and the newest
 * edit wins, the same rule a sync conflict uses. Changed files are marked for sync.
 */
export async function importBundle(store: LedgerStore, b: Bundle): Promise<{ files: number; newEntries: number }> {
  const errors = validateBundle(b);
  if (errors.length) throw new Error(`This file cannot be imported: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ""}`);
  let newEntries = 0;
  const paths = Object.keys(b.files);
  await store.transact(paths, (docs) => {
    for (const p of paths) {
      const local = docs.get(p);
      const incoming = b.files[p] as Doc;
      if (p.startsWith("months/")) {
        const have = new Set(((local?.entries as Entry[] | undefined) ?? []).map((e) => e.id));
        newEntries += (incoming.entries as Entry[]).filter((e) => !e.deleted && !have.has(e.id)).length;
      }
      docs.set(p, mergeDocs(p, local, incoming));
    }
  });
  return { files: paths.length, newEntries };
}

// ---- CSV -----------------------------------------------------------------------------------

const plain = (minor: number, cur: string) => {
  const d = minorDigits(cur);
  const s = String(Math.abs(minor)).padStart(d + 1, "0");
  return d ? `${s.slice(0, -d)}.${s.slice(-d)}` : s;
};

/** One cell, quoted when needed. A leading = + - @ is neutralised so spreadsheets never run it as a formula. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Stored entries as a spreadsheet-friendly CSV, oldest first. Recurring rules are not expanded. */
export function entriesCsv(entries: Entry[], people: Person[], accounts: Account[]): string {
  const name = (id: string) => (id === "me" ? "me" : people.find((p) => p.id === id)?.name ?? id);
  const head = ["date", "type", "category", "note", "amount", "currency", "rate", "account", "paid_by", "split", "shares"];
  const rows = entries
    .filter((e) => !e.deleted)
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
    .map((e) => [
      e.date, e.kind, e.category ?? "", e.note ?? "", plain(e.amount, e.currency), e.currency, e.rate ?? "",
      accounts.find((a) => a.id === e.accountId)?.name ?? "",
      e.split ? name(e.split.paidBy) : e.personId ? name(e.personId) : "",
      e.split?.mode ?? "",
      e.split ? e.split.shares.map((s) => `${name(s.personId)}:${plain(s.amount, e.currency)}`).join("; ") : "",
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
