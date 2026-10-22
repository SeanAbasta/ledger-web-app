import { useEffect, useState } from "react";
import { getSettings, listAll, nameOf } from "../../data/collections";
import { startAccount } from "../../data/defaults";
import { today } from "../../data/dates";
import { addEntry, deleteEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { incomeAccounts, newIncome, SIDE_INCOME } from "../../data/sideIncome";
import { monthOf, type Account, type Entry } from "../../data/schema";
import { MoneyInput } from "../../ui/MoneyInput";
import { CategoryChips } from "../../ui/CategoryChips";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { useLedger } from "../../ui/Ledger";
import { loadLastUsed, rememberUsed } from "../../ui/lastUsed";
import type { SavedNote } from "./AddForm";
import { afterSave, savedLine } from "./afterSave";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");

/**
 * New one-off income from another source (a gift, interest, a sale), or edit one (pass `entry`). Paid into
 * a bank account, in that account's currency. Salary is set in Coming up, never here.
 */
export function IncomeForm({ entry, onDone }: { entry?: Entry; onDone?: (saved?: SavedNote) => void }) {
  const { store, changed } = useLedger();
  const [base, setBase] = useState("PHP");
  const [all, setAll] = useState<(Account & { deleted?: true })[]>([]);
  const [amount, setAmount] = useState(entry ? plain(entry.amount, entry.currency) : "");
  const [category, setCategory] = useState(entry?.category ?? SIDE_INCOME[0]);
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(entry?.date ?? today());
  const [accountId, setAccountId] = useState(entry?.accountId ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [s, a] = await Promise.all([getSettings(store), listAll(store, "accounts")]);
      setBase(s.baseCurrency);
      setAll(a);
      if (!entry) {
        const banks = incomeAccounts(a);
        setAccountId((x) => x || startAccount("income", s.defaults, loadLastUsed(), banks) || banks[0]?.id || "");
      }
    })();
  }, [store, entry]);

  const banks = incomeAccounts(all);
  const account = all.find((a) => a.id === accountId);
  const currency = account?.currency ?? entry?.currency ?? base;
  // An edited entry's account that was removed stays listed until it is changed.
  const kept = accountId && !banks.some((a) => a.id === accountId) ? accountId : "";

  async function save() {
    setError("");
    try {
      const minor = parseMinor(amount, currency);
      if (!minor) return setError("Enter a valid amount");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
      if (banks.length > 0 && !accountId) return setError("Pick an account");
      const input = newIncome({ amount: minor, category, note, date, account, base });
      if (entry) {
        // A removed account keeps its entry's currency and rate as stored.
        await updateEntry(store, monthOf(entry.date), entry.id, account ? input : { ...input, currency: entry.currency, rate: entry.rate, accountId: entry.accountId });
      } else {
        await addEntry(store, input);
      }
      changed();
      if (entry) return onDone?.();
      rememberUsed({ income: accountId });
      const t = today();
      const r = afterSave({ form: "income", amount, note, date, accountId, category }, t);
      setAmount(r.amount); setNote(r.note); setDate(r.date);
      onDone?.({ date, message: savedLine({ note, category, amount: minor, currency, date, today: t }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function remove() {
    if (!entry) return;
    await deleteEntry(store, monthOf(entry.date), entry.id);
    changed();
    onDone?.();
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="amt">
        <MoneyInput aria-label="Amount" placeholder="0.00" value={amount} onChange={setAmount} currency={currency} autoFocus={!entry} />
        <span className="cur mute">{currency}</span>
      </div>
      <div className="field stack"><b>Category</b><CategoryChips list={SIDE_INCOME} value={category} onChange={setCategory} /></div>
      <label className="field stack"><b>Note</b><input className="notefield" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it?" /></label>
      <label className="field"><b>Date</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {(banks.length > 0 || kept) && (
        <label className="field"><b>Paid into</b>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {!accountId && <option value="" disabled>Pick an account</option>}
            {kept && <option value={kept}>{nameOf(kept, all, "Removed account")}</option>}
            {banks.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency !== base ? ` (${a.currency})` : ""}</option>)}
          </select></label>
      )}
      <p className="mute small">Money from other sources. Salary is set in Coming up, 12 months.</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        {entry && <ConfirmButton danger label="Delete" ask={confirmLabel("delete", entry)} onConfirm={() => void remove()} />}
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
