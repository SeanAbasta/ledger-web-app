import { useEffect, useState } from "react";
import { getSettings, list, upsert } from "../../data/collections";
import { labelDay, today } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import { applyRevision, baseFor, type Occurrence } from "../../data/rules";
import type { Account, Rule } from "../../data/schema";
import { DEFAULT_SETTINGS } from "../../data/schema";
import { Segmented } from "../../ui/Segmented";
import { useLedger } from "../../ui/Ledger";

type Scope = "this" | "later";
const SCOPES = ["this", "later"] as const;
const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");

/**
 * Edit one generated payment, or this one and every later one (a price change).
 * "This payment only" changes the amount and note; "this and later" can also change
 * category and account. Installments only offer "this payment only".
 */
export function OccurrenceForm({ occ, rule, onDone }: { occ: Occurrence; rule: Rule; onDone: () => void }) {
  const { store, changed } = useLedger();
  const installment = rule.type === "installment";
  const [scope, setScope] = useState<Scope>(installment || occ.date <= today() ? "this" : "later"); // a past payment is most likely a one-off fix, a future one a price change
  const [amount, setAmount] = useState(plain(occ.amount, occ.currency));
  const [note, setNote] = useState(occ.note ?? "");
  const [category, setCategory] = useState(occ.category ?? "");
  const [accountId, setAccountId] = useState(occ.accountId ?? "");
  const [categories, setCategories] = useState(DEFAULT_SETTINGS.categories);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setCategories((await getSettings(store)).categories);
      setAccounts(await list(store, "accounts"));
    })();
  }, [store]);

  async function save() {
    setError("");
    const minor = parseMinor(amount, occ.currency);
    if (!minor) return setError("Enter a valid amount");
    const cleanNote = note.trim();
    let next: Rule;
    if (scope === "later") {
      next = applyRevision(rule, occ.date, {
        amount: minor,
        note: cleanNote,
        category: category || undefined,
        accountId: accountId || undefined,
      });
    } else {
      // Only record what differs from the rule, so an unchanged payment leaves no override behind.
      const base = baseFor(rule, occ.date);
      const ov: { amount?: number; note?: string } = {};
      if (minor !== occ.baseAmount) ov.amount = minor;
      if (cleanNote !== (base.note ?? "")) ov.note = cleanNote;
      const overrides = { ...rule.overrides };
      if (Object.keys(ov).length) overrides[occ.date] = ov;
      else delete overrides[occ.date];
      next = { ...rule, overrides };
    }
    await upsert(store, "rules", next);
    changed();
    onDone();
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <p className="mute">{labelDay(occ.date)}{installment && ` · ${occ.index} of ${occ.count}`} · {occ.currency}</p>
      {!installment && (
        <div className="field"><b>Apply to</b>
          <Segmented value={scope} options={SCOPES} labels={{ this: "This payment", later: "This and later" }} onChange={setScope} /></div>
      )}
      <label className="field"><b>Amount</b><input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="field"><b>Note</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
      {scope === "later" && (
        <>
          <label className="field"><b>Category</b>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...new Set([...categories, category].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
            </select></label>
          {accounts.length > 0 && (
            <label className="field"><b>Account</b>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          )}
        </>
      )}
      <p className="mute small">
        {scope === "later" ? "Earlier payments keep what they were." : "Only this payment changes."}
        {occ.split && " The split stays as set."}
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
