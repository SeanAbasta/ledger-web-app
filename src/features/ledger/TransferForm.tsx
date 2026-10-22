import { useEffect, useState } from "react";
import { listAll, nameOf } from "../../data/collections";
import { today } from "../../data/dates";
import { addEntry, deleteEntry, restoreEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { isCard, type Account, type Entry } from "../../data/schema";
import { newTransfer, transferSources, transferTargets } from "../../data/transfers";
import type { SavedNote } from "../add/AddForm";
import { afterSave, savedLine } from "../add/afterSave";
import { MoneyInput } from "../../ui/MoneyInput";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { useLedger } from "../../ui/Ledger";
import { useToast } from "../../ui/Toast";
import type { TransferDraft } from "../add/draft";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");

/**
 * Edit a card payment or other transfer (pass `entry`): from, to, amount, date and note. Money stays in the
 * transfer's currency, so both ends list accounts in that currency. An account that was removed stays
 * selectable as "(removed)", so the form shows what is stored until it is changed.
 *
 * Without `entry` (the Add tab): a new transfer between two of my bank accounts in the same currency. Cards
 * are not offered (paying a card is the Pay button on Dashboard).
 */
export function TransferForm({ entry, accounts: given, onDone, onOpenSettings, draft }: { entry?: Entry; accounts?: (Account & { deleted?: true })[]; onDone: (saved?: SavedNote) => void; onOpenSettings?: () => void; draft?: TransferDraft }) {
  const { show } = useToast();
  const d = entry ? undefined : draft;
  const { store, changed } = useLedger();
  const [loaded, setLoaded] = useState<(Account & { deleted?: true })[]>();
  const [from, setFrom] = useState(entry?.accountId ?? d?.from ?? "");
  const [to, setTo] = useState(entry?.toAccountId ?? d?.to ?? "");
  const [amount, setAmount] = useState(entry ? plain(entry.amount, entry.currency) : d?.amount ?? "");
  const [date, setDate] = useState(entry?.date ?? d?.date ?? today());
  const [note, setNote] = useState(entry?.note ?? d?.note ?? "");
  const [error, setError] = useState("");

  // The Add tab passes no accounts, so the form loads them (removed ones too, for names).
  useEffect(() => {
    if (given) return;
    void listAll(store, "accounts").then((a) => {
      setLoaded(a);
      const first = transferSources(a)[0];
      setFrom((x) => x || first?.id || "");
      setTo((x) => x || (first ? transferTargets(a, first.id)[0]?.id : undefined) || "");
    });
  }, [store, given]);

  const accounts = given ?? loaded ?? [];
  const creating = !entry;
  const currency = entry?.currency ?? accounts.find((a) => a.id === from)?.currency ?? "";
  const live = accounts.filter((a) => !a.deleted && a.currency === currency);
  // The stored account first when it is not a live choice (removed, or no record at all).
  const keep = (id: string, list: Account[]) => (id && !list.some((a) => a.id === id) ? [<option key={id} value={id}>{nameOf(id, accounts, "Removed account")}</option>] : []);
  const fromList = creating ? transferSources(accounts) : live.filter((a) => !isCard(a));
  const toList = creating ? transferTargets(accounts, from) : live.filter((a) => a.id !== from);
  const opts = (list: Account[]) => list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);

  function pickFrom(id: string) {
    setFrom(id);
    // A new transfer's To must be another bank in the new From's currency.
    if (creating && !transferTargets(accounts, id).some((a) => a.id === to)) setTo(transferTargets(accounts, id)[0]?.id ?? "");
  }

  async function save() {
    setError("");
    const minor = parseMinor(amount, currency);
    if (!minor) return setError("Enter a valid amount");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
    try {
      if (entry) {
        await updateEntry(store, entry.date.slice(0, 7), entry.id, { amount: minor, date, accountId: from, toAccountId: to, note: note.trim() || undefined });
        changed();
        return onDone();
      }
      const made = await addEntry(store, newTransfer({ amount: minor, from: accounts.find((a) => a.id === from), to: accounts.find((a) => a.id === to), date, note }));
      changed();
      const t = today();
      const r = afterSave({ form: "transfer", amount, note, date, from, to }, t);
      setAmount(r.amount); setNote(r.note); setDate(r.date);
      onDone({ date, message: savedLine({ note, category: "Transfer", amount: minor, currency, date, today: t }), undo: () => deleteEntry(store, made.date.slice(0, 7), made.id), draft: { kind: "Transfer", fields: { amount, note, date, from, to } } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function remove() {
    if (!entry) return;
    await deleteEntry(store, entry.date.slice(0, 7), entry.id);
    changed();
    onDone();
    show({ message: `Deleted: ${entry.note || entry.category || "Transfer"} ${formatMinor(entry.amount, entry.currency)}`, undo: async () => { await restoreEntry(store, entry.date.slice(0, 7), entry.id); } });
  }

  if (creating && loaded && fromList.length === 0) {
    return (
      <div className="transferhint">
        <p className="mute">Add another bank account in Settings. A transfer moves money between two bank accounts in the same currency.</p>
        {onOpenSettings && <button type="button" className="btn ghost sm" onClick={onOpenSettings}>Open Settings</button>}
      </div>
    );
  }

  const toCards = toList.filter(isCard);
  const toBanks = toList.filter((a) => !isCard(a));
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {creating ? (
        <div className="amt">
          <MoneyInput aria-label="Amount" placeholder="0.00" value={amount} onChange={setAmount} currency={currency} autoFocus={!entry} />
          <span className="cur mute">{currency}</span>
        </div>
      ) : (
        <label className="field"><b>Amount</b><MoneyInput aria-label="Amount" value={amount} onChange={setAmount} currency={currency} /></label>
      )}
      <label className="field"><b>From</b>
        <select value={from} onChange={(e) => pickFrom(e.target.value)}>{keep(from, fromList)}{opts(fromList)}</select></label>
      <label className="field"><b>To</b>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {keep(to, toList)}
          {toCards.length > 0 && toBanks.length > 0
            ? <><optgroup label="Credit cards">{opts(toCards)}</optgroup><optgroup label="Bank accounts">{opts(toBanks)}</optgroup></>
            : opts(toList)}
        </select></label>
      <label className="field"><b>Date</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><b>Note</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
      <p className="mute small">Moves money between your accounts. Not counted as spending.</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        {entry && <ConfirmButton danger label="Delete" ask={confirmLabel("delete", entry)} onConfirm={() => void remove()} />}
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
