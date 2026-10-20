import { useEffect, useState } from "react";
import { getSettings, list, listAll, upsert } from "../../data/collections";
import { canBillNext, cutoffFor, dueFor, nextCutoff } from "../../data/cards";
import { CURRENCIES } from "../../data/currencies";
import { startAccount, startCategory } from "../../data/defaults";
import { addEntry, deleteEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor, splitEvenly } from "../../data/money";
import { labelShort, today } from "../../data/dates";
import type { Account, Entry, Frequency, Person, Settings, SplitMode } from "../../data/schema";
import { isCard, monthOf, DEFAULT_SETTINGS } from "../../data/schema";
import { addName, hasName, keptKey, namesOf, payerAfter, payerForMode, resolveNames, splitFormOf, splitFromForm, toggleName, type SplitFormState } from "../../data/splitForm";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { AccountOptions } from "../../ui/AccountOptions";
import { MODE_LABEL } from "../../ui/splitLabels";
import { CategoryChips } from "../../ui/CategoryChips";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { useLedger } from "../../ui/Ledger";
import { loadLastUsed, rememberUsed } from "../../ui/lastUsed";

type Kind = "one-off" | "recurring" | "installment";
const KINDS = ["one-off", "recurring", "installment"] as const;
const KIND_LABEL = { "one-off": "One-off", recurring: "Recurring", installment: "Installment" } as const;
const MODES = ["they-owe", "i-owe", "half", "custom"] as const;
const FREQ = ["weekly", "monthly", "yearly"] as const;
const FREQ_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

/** What was just added: a short line to show, and the date to open the Ledger at. */
export interface SavedNote { message: string; date: string }

/** New expense, or edit an existing one (pass `entry`). */
export function AddForm({ entry, onDone }: { entry?: Entry; onDone?: (saved?: SavedNote) => void }) {
  const { store, changed } = useLedger();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [amount, setAmount] = useState(entry ? formatMinor(entry.amount, entry.currency).replace(/[^\d.]/g, "") : "");
  const [currency, setCurrency] = useState(entry?.currency ?? "");
  const [rate, setRate] = useState(entry?.rate ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [date, setDate] = useState(entry?.date ?? today());
  const [accountId, setAccountId] = useState(entry?.accountId ?? "");
  // The account a new item started with, so the form can say it came from a default.
  const [startAcct, setStartAcct] = useState({ id: "", from: "" });
  const [kind, setKind] = useState<Kind>("one-off");
  const [freq, setFreq] = useState<Frequency>("monthly");
  const [count, setCount] = useState("12");
  const [end, setEnd] = useState("");

  const [nextBill, setNextBill] = useState(!!entry?.nextBill);
  const [split, setSplit] = useState(!!entry?.split);
  const [paidBy, setPaidBy] = useState(entry?.split?.paidBy ?? "me");
  const [mode, setMode] = useState<SplitMode>(entry?.split?.mode ?? "half");
  const [names, setNames] = useState("");
  const [newName, setNewName] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  // People in this split who were removed in Settings since. They stay in it unless the split is changed.
  const [kept, setKept] = useState<SplitFormState["kept"]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getSettings(store);
      const [p, a] = await Promise.all([list(store, "people"), list(store, "accounts")]);
      setSettings(s);
      setPeople(p);
      setAccounts(a);
      setCurrency((c) => c || s.defaultCurrency);
      const last = loadLastUsed();
      setCategory((c) => c || (entry ? s.categories[0] ?? "" : startCategory(s.defaults, last, s.categories)));
      if (!entry) {
        const start = startAccount("expense", s.defaults, last, a);
        setStartAcct({ id: start, from: s.defaults?.lastUsed && last.expense === start ? "last used" : "default" });
        setAccountId((x) => x || start);
      }
      if (entry?.split) {
        const f = splitFormOf(entry.split, entry.currency, p, await listAll(store, "people"));
        setNames(f.names);
        setPaidBy(f.paidBy);
        setCustom(f.custom);
        setKept(f.kept);
      }
    })();
  }, [store, entry]);

  const foreign = currency !== settings.baseCurrency;
  const nameList = namesOf(names);
  // When someone else paid a split, none of my money moved, so no account is needed.
  const someoneElsePaid = split && paidBy !== "me";
  const needsAccount = accounts.length > 0 && !someoneElsePaid;
  // "Bill on next statement": one-off card expenses I paid, dated on the cut-off day or up to 2 days before
  // (or already moved, so it can be turned off).
  const card = accounts.find((a) => a.id === accountId && isCard(a));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const billable = !!card && validDate && entry?.kind !== "income" && (!!entry || kind === "one-off") && !someoneElsePaid && (canBillNext(card, date) || !!entry?.nextBill);
  const nextCut = card && validDate ? nextCutoff(card, cutoffFor(card, date)) : undefined;

  async function save() {
    setError("");
    try {
      const minor = parseMinor(amount, currency);
      if (!minor) return setError("Enter a valid amount");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
      if (needsAccount && !accountId) return setError("Pick an account");
      if (foreign && !/^\d+(\.\d+)?$/.test(rate)) return setError(`Enter the ${currency} to ${settings.baseCurrency} rate`);
      const n = kind === "installment" ? Number(count) : 0;
      if (kind === "installment" && (!Number.isInteger(n) || n < 2)) return setError("Payments must be 2 or more");
      const perPayment = kind === "installment" ? splitEvenly(minor, n)[0]! : minor;

      let splitVal;
      if (split) {
        const named = await resolveNames(store, nameList, people);
        // New people are saved now; keep them in the list so another Save after an error does not add them twice.
        setPeople((ps) => [...ps, ...named.filter((p) => !ps.some((x) => x.id === p.id))]);
        // An unchanged split is saved exactly as stored; removed people in it are never dropped.
        const original = entry?.split ? { amount: entry.amount, split: entry.split } : undefined;
        splitVal = splitFromForm({ names, paidBy, mode, custom, kept }, named, perPayment, currency, original);
      }

      const base = {
        kind: entry?.kind === "income" ? ("income" as const) : ("expense" as const), // never turn an income entry into an expense
        amount: perPayment,
        currency,
        category,
        note: note || undefined,
        // Someone else paid: none of my money moved, so no account is saved (an edit clears an old one).
        accountId: someoneElsePaid ? undefined : accountId || undefined,
        split: splitVal,
        rate: foreign ? rate : undefined,
        nextBill: billable && nextBill ? (true as const) : undefined, // undefined clears it on an edit
      };

      if (entry) {
        await updateEntry(store, monthOf(entry.date), entry.id, { ...base, date });
      } else if (kind === "one-off") {
        await addEntry(store, { ...base, date });
      } else {
        const { rate: _r, ...ruleBase } = base;
        await upsert(store, "rules", {
          ...ruleBase,
          type: kind,
          frequency: freq,
          start: date,
          end: kind === "recurring" && end ? end : undefined,
          count: kind === "installment" ? n : undefined,
          total: kind === "installment" ? minor : undefined,
        });
      }
      changed();
      if (entry) return onDone?.();
      rememberUsed({ expense: someoneElsePaid ? undefined : accountId, category });
      setAmount("");
      setNote("");
      // A plan that starts later is easy to lose, so say when it begins.
      const later = kind !== "one-off" && date > today();
      onDone?.({ date, message: later ? `Saved. First payment ${labelShort(date)}${kind === "installment" ? `, ${n} payments` : ""}` : "Saved" });
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

  // Picked names as [key, shown name], spelled as the live person when there is one.
  const picks = nameList.map((n) => [n.toLowerCase(), people.find((p) => p.name.toLowerCase() === n.toLowerCase())?.name ?? n] as const);
  // One chip per live person (names that differ only in case share a key), then picked names not saved yet.
  const chips = [...new Map(people.map((p) => [p.name.toLowerCase(), p.name])).values(), ...picks.filter(([k]) => !people.some((p) => p.name.toLowerCase() === k)).map(([, n]) => n)];
  const tap = (n: string) => {
    const next = toggleName(names, n);
    setNames(next);
    setPaidBy(payerAfter(paidBy, mode, next, kept));
  };
  const add = () => {
    setNames(addName(names, newName, people));
    setNewName("");
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="amt">
        <MoneyInput aria-label="Amount" placeholder="0.00" value={amount} onChange={setAmount} currency={currency || settings.defaultCurrency} autoFocus={!entry} />
        <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([settings.defaultCurrency, ...CURRENCIES, currency].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {foreign && (
        <label className="field"><b>Rate</b><input placeholder={`${settings.baseCurrency} per 1 ${currency}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      )}
      <div className="field stack"><b>Category</b><CategoryChips list={settings.categories} value={category} onChange={setCategory} /></div>
      <label className="field"><b>Note</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
      <label className="field"><b>{kind === "one-off" ? "Date" : "Starts"}{card && validDate && cutoffFor(card, date) === date && <span className="tag">statement day</span>}</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {accounts.length > 0 && (
        <label className="field"><b>Account{!entry && !someoneElsePaid && accountId && accountId === startAcct.id && <span className="tag">{startAcct.from}</span>}</b>
          {/* Someone else paid: only None. The picked account is kept in state and comes back if I paid after all. */}
          <select value={someoneElsePaid ? "" : accountId} onChange={(e) => setAccountId(e.target.value)}>
            {someoneElsePaid ? <option value="">None</option> : <>{!accountId && <option value="" disabled>Pick an account</option>}<AccountOptions accounts={accounts} /></>}
          </select></label>
      )}

      {billable && card && nextCut && (
        <div className="field"><b>Bill on next statement<span className="mute small sub">{labelShort(nextCut)} statement, due {labelShort(dueFor(card, nextCut))}</span></b>
          <button type="button" className={`toggle ${nextBill ? "on" : ""}`} aria-pressed={nextBill} aria-label="Bill on next statement" onClick={() => setNextBill(!nextBill)}><i /></button></div>
      )}
      {!entry && (
        <div className="field"><b>Type</b><Segmented value={kind} options={KINDS} labels={KIND_LABEL} onChange={setKind} /></div>
      )}
      {kind !== "one-off" && !entry && (
        <>
          <div className="field"><b>Every</b><Segmented value={freq} options={FREQ} labels={FREQ_LABEL} onChange={setFreq} /></div>
          {kind === "installment" ? (
            <label className="field"><b>Payments</b><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
              <span className="mute small">amount above is the total</span></label>
          ) : (
            <label className="field"><b>Ends</b><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          )}
        </>
      )}

      {entry?.kind !== "income" && (
        <div className="field"><b>Split</b>
          <button type="button" className={`toggle ${split ? "on" : ""}`} aria-pressed={split} aria-label="Split" onClick={() => setSplit(!split)}><i /></button></div>
      )}
      {split && entry?.kind !== "income" && (
        <>
          <div className="field stack"><b>People</b>
            {chips.length > 0 ? (
              <div className="picks">{chips.map((n) => {
                const on = hasName(names, n);
                return <button key={n.toLowerCase()} type="button" className={on ? "pick on" : "pick"} aria-pressed={on} onClick={() => tap(n)}>{n}</button>;
              })}</div>
            ) : <span className="mute small">Add the people you split with</span>}
            <div className="addpick">
              <input aria-label="New person" placeholder="New person" enterKeyHint="done" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
              <button type="button" className="btn ghost sm" disabled={!newName.trim()} onClick={add}>Add</button>
            </div></div>
          {kept.length > 0 && (
            <div className="field"><b>Also in this split</b>
              <span className="kept">{kept.map((k) => <span key={k.id}>{k.name}<span className="tag">removed</span></span>)}</span></div>
          )}
          <div className="field"><b>Mode</b><Segmented value={mode} options={MODES} labels={MODE_LABEL} onChange={(m) => { setMode(m); setPaidBy(payerForMode(m, paidBy, names, kept)); }} /></div>
          <div className="field stack"><b>Paid by</b>
            <div className="picks" role="radiogroup" aria-label="Paid by">
              {[["me", "Me"] as const, ...picks, ...kept.map((k) => [keptKey(k.id), `${k.name} (removed)`] as const)].map(([k, n]) => (
                <button key={k} type="button" role="radio" aria-checked={k === paidBy} className={k === paidBy ? "pick on" : "pick"} onClick={() => setPaidBy(k)}>{n}</button>
              ))}
            </div></div>
          {mode === "custom" && picks.map(([k, n]) => (
            <label className="field" key={k}><b>{n} owes</b><MoneyInput value={custom[k] ?? ""} onChange={(v) => setCustom({ ...custom, [k]: v })} currency={currency} /></label>
          ))}
          {mode === "custom" && kept.map((k) => (
            <label className="field" key={k.id}><b>{k.name} owes<span className="tag">removed</span></b><MoneyInput value={custom[keptKey(k.id)] ?? ""} onChange={(v) => setCustom({ ...custom, [keptKey(k.id)]: v })} currency={currency} /></label>
          ))}
        </>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        {entry && <ConfirmButton danger label="Delete" ask={confirmLabel("delete", entry)} onConfirm={() => void remove()} />}
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
