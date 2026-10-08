import { useEffect, useState } from "react";
import { getSettings, list, upsert } from "../../data/collections";
import { CURRENCIES } from "../../data/currencies";
import { addEntry, deleteEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor, splitEvenly } from "../../data/money";
import { today } from "../../data/dates";
import type { Account, Entry, Frequency, Person, Settings, SplitMode, SplitShare } from "../../data/schema";
import { monthOf, DEFAULT_SETTINGS } from "../../data/schema";
import { buildSplit } from "../../data/splits";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { useLedger } from "../../ui/Ledger";

type Kind = "one-off" | "recurring" | "installment";
const KINDS = ["one-off", "recurring", "installment"] as const;
const KIND_LABEL = { "one-off": "One-off", recurring: "Recurring", installment: "Installment" } as const;
const MODES = ["they-owe", "i-owe", "half", "custom"] as const;
const MODE_LABEL = { "they-owe": "They owe", "i-owe": "I owe", half: "50/50", custom: "Custom" } as const;
const FREQ = ["weekly", "monthly", "yearly"] as const;
const FREQ_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

/** New expense, or edit an existing one (pass `entry`). */
export function AddForm({ entry, onDone }: { entry?: Entry; onDone?: () => void }) {
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
  const [kind, setKind] = useState<Kind>("one-off");
  const [freq, setFreq] = useState<Frequency>("monthly");
  const [count, setCount] = useState("12");
  const [end, setEnd] = useState("");

  const [split, setSplit] = useState(!!entry?.split);
  const [paidBy, setPaidBy] = useState(entry?.split?.paidBy ?? "me");
  const [mode, setMode] = useState<SplitMode>(entry?.split?.mode ?? "half");
  const [names, setNames] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const s = await getSettings(store);
      const [p, a] = await Promise.all([list(store, "people"), list(store, "accounts")]);
      setSettings(s);
      setPeople(p);
      setAccounts(a);
      setCurrency((c) => c || s.defaultCurrency);
      setCategory((c) => c || s.categories[0] || "");
      if (entry?.split) {
        const ids = entry.split.shares.map((x) => x.personId).concat(entry.split.paidBy).filter((x) => x !== "me");
        setNames([...new Set(ids)].map((id) => p.find((x) => x.id === id)?.name ?? "").filter(Boolean).join(", "));
        const nm = (id: string) => p.find((x) => x.id === id)?.name.toLowerCase() ?? id;
        setPaidBy(entry.split.paidBy === "me" ? "me" : nm(entry.split.paidBy));
        setCustom(Object.fromEntries(entry.split.shares.map((x) => [nm(x.personId), formatMinor(x.amount, entry.currency).replace(/[^\d.]/g, "")])));
      }
    })();
  }, [store, entry]);

  const foreign = currency !== settings.baseCurrency;
  const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);

  async function resolvePeople(): Promise<Person[]> {
    const out: Person[] = [];
    for (const n of nameList) {
      const found = [...people, ...out].find((p) => p.name.toLowerCase() === n.toLowerCase());
      out.push(found ?? (await upsert(store, "people", { name: n })));
    }
    return out;
  }

  async function save() {
    setError("");
    try {
      const minor = parseMinor(amount, currency);
      if (!minor) return setError("Enter a valid amount");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
      if (foreign && !/^\d+(\.\d+)?$/.test(rate)) return setError(`Enter the ${currency} to ${settings.baseCurrency} rate`);
      const n = kind === "installment" ? Number(count) : 0;
      if (kind === "installment" && (!Number.isInteger(n) || n < 2)) return setError("Payments must be 2 or more");
      const perPayment = kind === "installment" ? splitEvenly(minor, n)[0]! : minor;

      let splitVal;
      if (split) {
        const ps = await resolvePeople();
        const payer = paidBy === "me" ? "me" : ps.find((p) => p.name.toLowerCase() === paidBy)?.id ?? "me";
        const shares: SplitShare[] = ps.map((p) => ({ personId: p.id, amount: parseMinor(custom[p.name.toLowerCase()] ?? "0", currency) ?? 0 }));
        splitVal = buildSplit({ amount: perPayment, paidBy: payer, mode, people: ps.map((p) => p.id), custom: shares });
      }

      const base = {
        kind: entry?.kind === "income" ? ("income" as const) : ("expense" as const), // never turn an income entry into an expense
        amount: perPayment,
        currency,
        category,
        note: note || undefined,
        accountId: accountId || undefined,
        split: splitVal,
        rate: foreign ? rate : undefined,
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
      if (!entry) {
        setAmount("");
        setNote("");
      }
      onDone?.();
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

  const picks = [...new Map(nameList.map((n) => [n.toLowerCase(), n])).entries()];

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="amt">
        <MoneyInput aria-label="Amount" placeholder="0.00" value={amount} onChange={setAmount} currency={currency || settings.defaultCurrency} autoFocus />
        <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([settings.defaultCurrency, ...CURRENCIES, currency].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {foreign && (
        <label className="field"><b>Rate</b><input placeholder={`${settings.baseCurrency} per 1 ${currency}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      )}
      <label className="field"><b>Category</b>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{settings.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="field"><b>Note</b><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
      <label className="field"><b>{kind === "one-off" ? "Date" : "Starts"}</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {accounts.length > 0 && (
        <label className="field"><b>Account</b>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
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
          <button type="button" className={`toggle ${split ? "on" : ""}`} aria-pressed={split} onClick={() => setSplit(!split)}><i /></button></div>
      )}
      {split && entry?.kind !== "income" && (
        <>
          <label className="field"><b>People</b><input list="people" placeholder="Maya, Jon" value={names} onChange={(e) => setNames(e.target.value)} />
            <datalist id="people">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist></label>
          <div className="field"><b>Mode</b><Segmented value={mode} options={MODES} labels={MODE_LABEL} onChange={(m) => { setMode(m); if (m === "i-owe" && paidBy === "me") setPaidBy(picks[0]?.[0] ?? "me"); }} /></div>
          <label className="field"><b>Paid by</b>
            <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              <option value="me">Me</option>
              {picks.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select></label>
          {mode === "custom" && picks.map(([k, n]) => (
            <label className="field" key={k}><b>{n} owes</b><MoneyInput value={custom[k] ?? ""} onChange={(v) => setCustom({ ...custom, [k]: v })} currency={currency} /></label>
          ))}
        </>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      <div className="actions">
        {entry && <button type="button" className="btn ghost danger" onClick={() => void remove()}>Delete</button>}
        <button type="submit" className="btn">Save</button>
      </div>
    </form>
  );
}
