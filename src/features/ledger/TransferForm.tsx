import { useState } from "react";
import { nameOf } from "../../data/collections";
import { deleteEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { isCard, type Account, type Entry } from "../../data/schema";
import { MoneyInput } from "../../ui/MoneyInput";
import { useLedger } from "../../ui/Ledger";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");

/**
 * Edit a card payment or other transfer: from, to, amount and date. Money stays in the transfer's
 * currency, so both ends list accounts in that currency. An account that was removed stays
 * selectable as "(removed)", so the form shows what is stored until it is changed.
 */
export function TransferForm({ entry, accounts, onDone }: { entry: Entry; accounts: (Account & { deleted?: true })[]; onDone: () => void }) {
  const { store, changed } = useLedger();
  const [from, setFrom] = useState(entry.accountId ?? "");
  const [to, setTo] = useState(entry.toAccountId ?? "");
  const [amount, setAmount] = useState(plain(entry.amount, entry.currency));
  const [date, setDate] = useState(entry.date);
  const [error, setError] = useState("");
  const live = accounts.filter((a) => !a.deleted && a.currency === entry.currency);
  // The stored account first when it is not a live choice (removed, or no record at all).
  const keep = (id: string, list: Account[]) => (id && !list.some((a) => a.id === id) ? [<option key={id} value={id}>{nameOf(id, accounts, "Removed account")}</option>] : []);
  const fromList = live.filter((a) => !isCard(a));
  const toList = live.filter((a) => a.id !== from);
  const opts = (list: Account[]) => list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);

  async function save() {
    setError("");
    const minor = parseMinor(amount, entry.currency);
    if (!minor) return setError("Enter a valid amount");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
    try {
      await updateEntry(store, entry.date.slice(0, 7), entry.id, { amount: minor, date, accountId: from, toAccountId: to });
      changed();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function remove() {
    await deleteEntry(store, entry.date.slice(0, 7), entry.id);
    changed();
    onDone();
  }

  const toCards = toList.filter(isCard);
  const toBanks = toList.filter((a) => !isCard(a));
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="field"><b>Amount</b><MoneyInput aria-label="Amount" value={amount} onChange={setAmount} currency={entry.currency} /></label>
      <label className="field"><b>From</b>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>{keep(from, fromList)}{opts(fromList)}</select></label>
      <label className="field"><b>To</b>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {keep(to, toList)}
          {toCards.length > 0 && toBanks.length > 0
            ? <><optgroup label="Credit cards">{opts(toCards)}</optgroup><optgroup label="Bank accounts">{opts(toBanks)}</optgroup></>
            : opts(toList)}
        </select></label>
      <label className="field"><b>Date</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <p className="mute small">Moves money between your accounts. Not counted as spending.</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost danger" onClick={() => void remove()}>Delete</button>
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
