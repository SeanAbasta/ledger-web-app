import { upsert } from "./collections";
import type { LedgerStore } from "./db";
import { addMonths, monthEnd, monthStart, parts } from "./dates";
import { addEntry, deleteEntry, loadAllEntries, loadEntries, updateEntry } from "./months";
import { occurrences } from "./rules";
import type { Entry, IsoDate, Minor, Rule } from "./schema";

/** Salary for one month: from the repeating rule if there is one, else a manual entry. */
export interface Salary {
  amount: Minor;
  source: "rule" | "entry";
  ruleId?: string;
  entryId?: string;
}

const isSalaryRule = (r: Rule) => r.type === "income" && !r.deleted;
const isSalaryEntry = (e: Entry) => e.kind === "income" && e.category === "Salary" && !e.deleted;

export function salaryFor(month: IsoDate, entries: Entry[], rules: Rule[]): Salary | undefined {
  const ms = monthStart(month);
  const me = monthEnd(month);
  for (const r of rules.filter(isSalaryRule)) {
    const o = occurrences(r, ms, me)[0];
    if (o) return { amount: o.amount, source: "rule", ruleId: r.id };
  }
  const e = entries.find((x) => isSalaryEntry(x) && x.date >= ms && x.date <= me);
  return e ? { amount: e.amount, source: "entry", entryId: e.id } : undefined;
}

export const activeSalaryRule = (rules: Rule[], today: IsoDate): Rule | undefined =>
  rules.find((r) => isSalaryRule(r) && (!r.end || r.end >= today));

/** The date a monthly rule lands on in `month`, or undefined if the month is before it starts. */
function ruleDateIn(r: Rule, month: IsoDate): IsoDate | undefined {
  const [sy, sm] = parts(r.start);
  const [y, m] = parts(month);
  const i = (y - sy) * 12 + (m - sm);
  if (i < 0) return undefined;
  const d = addMonths(r.start, i);
  return r.end && d > r.end ? undefined : d;
}

/** Set (or clear, with null) the salary for one month. */
export async function setSalary(store: LedgerStore, month: IsoDate, amount: Minor | null, opts: { base: string; accountId?: string }): Promise<void> {
  const ms = monthStart(month);
  const rules = (await store.get<{ rules?: Rule[] }>("rules.json"))?.rules ?? [];
  const rule = rules.filter(isSalaryRule).find((r) => ruleDateIn(r, ms));
  if (rule) {
    const date = ruleDateIn(rule, ms)!;
    const overrides = { ...rule.overrides };
    let skipped = (rule.skipped ?? []).filter((d) => d !== date);
    delete overrides[date];
    if (amount === null || amount === 0) skipped = [...skipped, date];
    else if (amount !== rule.amount) overrides[date] = { amount };
    await upsert(store, "rules", { ...rule, overrides, skipped });
    return;
  }
  const entries = await loadEntries(store, ms, monthEnd(ms));
  const existing = entries.find((e) => isSalaryEntry(e) && e.date >= ms);
  if (!amount) {
    if (existing) await deleteEntry(store, ms.slice(0, 7), existing.id);
  } else if (existing) {
    await updateEntry(store, ms.slice(0, 7), existing.id, { amount });
  } else {
    await addEntry(store, { kind: "income", date: ms, amount, currency: opts.base, category: "Salary", accountId: opts.accountId });
  }
}

/**
 * Turn "repeat every month" on or off. On: the first month from `thisMonth` with a salary becomes
 * a monthly rule; manual salary entries from then on fold into it as per-month overrides.
 */
export async function setRepeat(store: LedgerStore, on: boolean, opts: { today: IsoDate; base: string; accountId?: string }): Promise<void> {
  const rules = (await store.get<{ rules?: Rule[] }>("rules.json"))?.rules ?? [];
  const active = activeSalaryRule(rules, opts.today);
  if (!on) {
    if (!active) return;
    if (active.start > monthEnd(opts.today)) await upsert(store, "rules", { ...active, deleted: true });
    else await upsert(store, "rules", { ...active, end: monthEnd(opts.today) });
    return;
  }
  if (active) return;
  const entries = (await loadAllEntries(store)).filter(isSalaryEntry).filter((e) => e.date >= monthStart(opts.today)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = entries[0];
  if (!first) throw new Error("Enter a salary first");
  const start = monthStart(first.date);
  const overrides: Rule["overrides"] = {};
  for (const e of entries) {
    if (e.amount !== first.amount) overrides[monthStart(e.date)] = { amount: e.amount };
  }
  await upsert(store, "rules", {
    type: "income", kind: "income", amount: first.amount, currency: opts.base, category: "Salary", accountId: opts.accountId ?? first.accountId,
    frequency: "monthly", start, overrides,
  });
  for (const e of entries) await deleteEntry(store, e.date.slice(0, 7), e.id);
}
