import { useEffect, useState } from "react";
import { getSettings, listAll, upsert } from "../../data/collections";
import { today } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import { applyPlanEdit, diffLines, diffPlan, patchOf } from "../../data/planEdit";
import { isCard, type Account, type Frequency, type Rule } from "../../data/schema";
import { AccountOptions } from "../../ui/AccountOptions";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { useLedger } from "../../ui/Ledger";

const FREQ = ["weekly", "monthly", "yearly"] as const;
const FREQ_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;
const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Edit a whole plan: Starts, Every, and Payments and Total (installments) or Ends (recurring), plus Note,
 * Category and Account for every payment. A live preview says what changes before anything is saved,
 * because payments that already posted can move, appear or go. The currency is fixed.
 */
export function PlanEditForm({ rule, onDone }: { rule: Rule; onDone: () => void }) {
  const { store, changed } = useLedger();
  const installment = rule.type === "installment";
  const start0 = patchOf(rule);
  const [start, setStart] = useState(start0.start);
  const [freq, setFreq] = useState<Frequency>(start0.frequency);
  const [count, setCount] = useState(String(rule.count ?? ""));
  const [total, setTotal] = useState(rule.total !== undefined ? plain(rule.total, rule.currency) : "");
  const [end, setEnd] = useState(start0.end ?? "");
  const [note, setNote] = useState(rule.note ?? "");
  const [category, setCategory] = useState(rule.category ?? "");
  const [accountId, setAccountId] = useState(rule.accountId ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<(Account & { deleted?: true })[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setCategories((await getSettings(store)).categories);
      setAccounts(await listAll(store, "accounts"));
    })();
  }, [store]);

  // The edit as it stands, or why it cannot be saved yet. The preview and Save use the same result.
  const n = Number(count);
  const minor = installment ? parseMinor(total, rule.currency) : null;
  const problem = !isDate(start) ? "Pick a start date"
    : installment && (!Number.isInteger(n) || n < 2) ? "Payments must be a whole number, 2 or more"
    : installment && !minor ? "Total must be above zero"
    : !installment && end && !isDate(end) ? "Pick an end date or leave it empty"
    : !installment && end && end < start ? "Ends cannot be before Starts"
    : "";
  const next = problem ? undefined : applyPlanEdit(rule, { start, frequency: freq, count: installment ? n : undefined, total: minor ?? undefined, end, note: note.trim(), category, accountId });
  const card = accounts.find((a) => a.id === accountId && isCard(a));
  const lines = next ? diffLines(diffPlan(rule, next, today()), { fmt: (m) => formatMinor(m, rule.currency), card: card?.name }) : [];
  const live = accounts.filter((a) => !a.deleted);
  const removed = accounts.find((a) => a.id === accountId && a.deleted);
  const cats = category && !categories.includes(category) ? [...categories, category] : categories;

  async function save() {
    setError("");
    if (problem || !next) return setError(problem);
    await upsert(store, "rules", next);
    changed();
    onDone();
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="field"><b>Starts</b><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <div className="field"><b>Every</b><Segmented label="Every" value={freq} options={FREQ} labels={FREQ_LABEL} onChange={setFreq} /></div>
      {installment ? (
        <>
          <label className="field"><b>Payments</b><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></label>
          <label className="field"><b>Total<span className="mute small sub">amount is the total, {rule.currency}</span></b><MoneyInput aria-label="Total" value={total} onChange={setTotal} currency={rule.currency} /></label>
        </>
      ) : (
        <label className="field"><b>Ends<span className="mute small sub">Optional</span></b><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      )}
      <label className="field"><b>Note</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it?" /></label>
      <label className="field"><b>Category</b>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{!category && <option value="">None</option>}{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="field"><b>Account<span className="mute small sub">all payments</span></b>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {!accountId && <option value="">None</option>}
          {removed && <option value={removed.id}>{removed.name} (removed)</option>}
          <AccountOptions accounts={live} />
        </select></label>
      {/* What the change does, worked out from the plan before and after, before anything is saved. */}
      <div className="pv" aria-live="polite">
        {problem ? <p className="err">{problem}</p> : lines.map((l) => <p key={l}>{l}</p>)}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn" disabled={!!problem}>Save plan</button>
      </div>
    </form>
  );
}
