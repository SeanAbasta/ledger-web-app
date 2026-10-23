import { useEffect, useState } from "react";
import { getSettings, list, listAll, remove as removeItem, upsert } from "../../data/collections";
import { canBillNext, cutoffFor, dueFor, nextCutoff } from "../../data/cards";
import { CURRENCIES } from "../../data/currencies";
import { startAccount, startCategory } from "../../data/defaults";
import { addEntry, deleteEntry, loadEntries, restoreEntry, updateEntry } from "../../data/months";
import { formatMinor, parseMinor, splitEvenly } from "../../data/money";
import { addDays, labelShort, today } from "../../data/dates";
import type { Account, Entry, Frequency, Person, Settings, SplitMode } from "../../data/schema";
import { isCard, monthOf, DEFAULT_SETTINGS } from "../../data/schema";
import { addName, hasName, keptKey, namesOf, payerAfter, payerForMode, resolveNames, splitFormOf, splitFromForm, toggleName, type SplitFormState } from "../../data/splitForm";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { AccountOptions } from "../../ui/AccountOptions";
import { MODE_LABEL } from "../../ui/splitLabels";
import { CategoryChips } from "../../ui/CategoryChips";
import { afterSave, opensLedger, savedLine } from "./afterSave";
import { modeAfterPayer, modesFor, splitPreview } from "./splitPreview";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { useLedger } from "../../ui/Ledger";
import { useKeyboardInset } from "../../ui/useKeyboardInset";
import { UNDO_FAILED, useToast } from "../../ui/Toast";
import { myShare } from "../../data/splits";
import type { Draft, ExpenseDraft } from "./draft";
import { recents, type Again } from "./recents";
import { loadLastUsed, rememberUsed } from "../../ui/lastUsed";

type Kind = "one-off" | "recurring" | "installment";
const KINDS = ["one-off", "recurring", "installment"] as const;
// "Repeats" says what happens; Every, Payments and Ends open under it.
const KIND_LABEL = { "one-off": "No", recurring: "Recurring", installment: "In installments" } as const;
const FREQ = ["weekly", "monthly", "yearly"] as const;
const FREQ_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as const;

/**
 * What was just added: a short line to show, and the date to open the Ledger at. `open` is set when the
 * Add tab should go straight to the Ledger (a plan that starts later); otherwise it stays on Add.
 */
export interface SavedNote {
  message: string;
  date: string;
  open?: boolean;
  /** The Undo toast: its first line (else `message`), a second line (my share and who owes), and the way back. */
  toast?: string;
  sub?: string;
  undo?: () => Promise<void>;
  /** The form's values when saved, for Undo to put back. */
  draft?: Draft;
}

/** New expense, or edit an existing one (pass `entry`). `draft` starts a new one from values put back by Undo. */
export function AddForm({ entry, onDone, draft }: { entry?: Entry; onDone?: (saved?: SavedNote) => void; draft?: ExpenseDraft }) {
  const { store, rev, changed } = useLedger();
  const { show } = useToast();
  const d = entry ? undefined : draft;
  // Again chips (new expenses only): the most repeated notes of the last 30 days.
  const [again, setAgain] = useState<Again[]>([]);
  // Where the category came from when an Again chip filled it ("from Coffee").
  const [catSource, setCatSource] = useState<{ name: string; from: string }>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [amount, setAmount] = useState(entry ? formatMinor(entry.amount, entry.currency).replace(/[^\d.]/g, "") : d?.amount ?? "");
  const [currency, setCurrency] = useState(entry?.currency ?? d?.currency ?? "");
  const [rate, setRate] = useState(entry?.rate ?? d?.rate ?? "");
  const [category, setCategory] = useState(entry?.category ?? d?.category ?? "");
  const [note, setNote] = useState(entry?.note ?? d?.note ?? "");
  const [date, setDate] = useState(entry?.date ?? d?.date ?? today());
  const [accountId, setAccountId] = useState(entry?.accountId ?? d?.accountId ?? "");
  // The account and category a new item started with, so the form can say they came from a default.
  const [startAcct, setStartAcct] = useState({ id: "", from: "" });
  const [startCat, setStartCat] = useState({ name: "", from: "" });
  const [kind, setKind] = useState<Kind>(d?.type ?? "one-off");
  const [freq, setFreq] = useState<Frequency>(d?.freq ?? "monthly");
  const [count, setCount] = useState(d?.count ?? "12");
  const [end, setEnd] = useState(d?.end ?? "");

  const [nextBill, setNextBill] = useState(!!entry?.nextBill || !!d?.nextBill);
  const [split, setSplit] = useState(!!entry?.split || !!d?.split);
  const [paidBy, setPaidBy] = useState(entry?.split?.paidBy ?? d?.paidBy ?? "me");
  const [mode, setMode] = useState<SplitMode>(entry?.split?.mode ?? d?.mode ?? "half");
  const [names, setNames] = useState(d?.names ?? "");
  const [newName, setNewName] = useState(d?.newName ?? "");
  const [custom, setCustom] = useState<Record<string, string>>(d?.custom ?? {});
  // People in this split who were removed in Settings since. They stay in it unless the split is changed.
  const [kept, setKept] = useState<SplitFormState["kept"]>(d?.kept ?? []);
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
      const cat = startCategory(s.defaults, last, s.categories);
      if (!entry) setStartCat({ name: cat, from: s.defaults?.lastUsed && last.category === cat ? "last used" : s.defaults?.category === cat ? "default" : "" });
      setCategory((c) => c || (entry ? s.categories[0] ?? "" : cat));
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

  useEffect(() => {
    if (entry) return;
    let stale = false;
    const t = today();
    void loadEntries(store, addDays(t, -30), t).then((es) => { if (!stale) setAgain(recents(es, t)); });
    return () => { stale = true; };
  }, [store, rev, entry]);

  // The Add tab (not an edit sheet): Save rides above the tab bar, and on the keyboard while typing.
  useKeyboardInset(!entry);
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

      // What Undo of Save takes back out: the new entry, or the new plan.
      let takeBack: (() => Promise<void>) | undefined;
      if (entry) {
        await updateEntry(store, monthOf(entry.date), entry.id, { ...base, date });
      } else if (kind === "one-off") {
        const made = await addEntry(store, { ...base, date });
        takeBack = () => deleteEntry(store, monthOf(made.date), made.id);
      } else {
        const { rate: _r, ...ruleBase } = base;
        const made = await upsert(store, "rules", {
          ...ruleBase,
          type: kind,
          frequency: freq,
          start: date,
          end: kind === "recurring" && end ? end : undefined,
          count: kind === "installment" ? n : undefined,
          total: kind === "installment" ? minor : undefined,
        });
        takeBack = () => removeItem(store, "rules", made.id);
      }
      changed();
      if (entry) return onDone?.();
      // The toast's second line: my share and who owes whom, the same words as the preview.
      const owes = preview && !("error" in preview) ? preview.lines : [];
      const sub = splitVal ? [`yours ${formatMinor(myShare(perPayment, splitVal), currency)}`, ...owes].join(", ") : undefined;
      const draftNow: ExpenseDraft = { amount, note, date, accountId, category, type: kind, freq, count, end, nextBill, split, names, newName, mode, paidBy, custom, kept, currency, rate };
      rememberUsed({ expense: someoneElsePaid ? undefined : accountId, category });
      // Stay on Add for the next one: clear what belongs to this item, keep account and category.
      const t = today();
      const r = afterSave({ form: "expense", amount, note, date, accountId, category, type: kind, freq, count, end, nextBill, split, names, newName, mode, paidBy, custom, kept }, t);
      setAmount(r.amount); setNote(r.note); setDate(r.date);
      setKind(r.type); setFreq(r.freq); setCount(r.count); setEnd(r.end); setNextBill(r.nextBill);
      setSplit(r.split); setNames(r.names); setNewName(r.newName); setMode(r.mode); setPaidBy(r.paidBy); setCustom(r.custom); setKept(r.kept);
      // A plan that starts later is easy to lose, so it still opens the Ledger at its first payment.
      const line = savedLine({ note, category, amount: minor, currency, date, today: t });
      const undoable = { toast: line, sub, undo: takeBack, draft: { kind: "Expense" as const, fields: draftNow } };
      onDone?.(opensLedger(kind, date, t)
        ? { date, open: true, message: `Saved. First payment ${labelShort(date)}${kind === "installment" ? `, ${n} payments` : ""}`, ...undoable }
        : { date, message: line, ...undoable });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function remove() {
    if (!entry) return;
    await deleteEntry(store, monthOf(entry.date), entry.id);
    changed();
    onDone?.();
    show({ message: `Deleted: ${entry.note || entry.category || "Expense"} ${formatMinor(entry.amount, entry.currency)}`, undo: async () => { await restoreEntry(store, monthOf(entry.date), entry.id); }, failed: UNDO_FAILED.delete });
  }

  // Picked names as [key, shown name], spelled as the live person when there is one.
  const picks = nameList.map((n) => [n.toLowerCase(), people.find((p) => p.name.toLowerCase() === n.toLowerCase())?.name ?? n] as const);
  // One chip per live person (names that differ only in case share a key), then picked names not saved yet.
  const chips = [...new Map(people.map((p) => [p.name.toLowerCase(), p.name])).values(), ...picks.filter(([k]) => !people.some((p) => p.name.toLowerCase() === k)).map(([, n]) => n)];
  const tap = (n: string) => {
    const next = toggleName(names, n);
    setNames(next);
    const p = payerAfter(paidBy, mode, next, kept);
    setPaidBy(p);
    setMode(modeAfterPayer(mode, p));
  };
  // Picking who paid swaps a mode that no longer fits (They owe and I owe), so no invalid pair can be saved.
  const pickPayer = (k: string) => {
    setPaidBy(k);
    setMode(modeAfterPayer(mode, k));
  };
  // Who owes whom before Save, worked out by the same code Save uses.
  const preview = split && entry?.kind !== "income"
    ? splitPreview({ names, paidBy, mode, custom, kept }, amount, currency || settings.defaultCurrency, people, entry ? "one-off" : kind, count, entry?.split ? { amount: entry.amount, split: entry.split } : undefined)
    : undefined;
  const add = () => {
    setNames(addName(names, newName, people));
    setNewName("");
  };

  // An Again chip's split in the form's terms: names of live people (a removed person drops the split).
  const againSplit = (a: Again) => {
    if (!a.split) return undefined;
    const names = a.split.people.map((id) => people.find((p) => p.id === id)?.name);
    if (names.some((x) => !x)) return undefined;
    const payer = a.split.paidBy === "me" ? "me" : people.find((p) => p.id === a.split!.paidBy)?.name.toLowerCase();
    return payer ? { names: names as string[], paidBy: payer, mode: a.split.mode } : undefined;
  };
  const againWords = (a: Again) => {
    const s = againSplit(a);
    if (!s) return a.category ?? "";
    const who = s.names.filter((x) => x.toLowerCase() !== s.paidBy);
    return s.paidBy === "me" ? `${MODE_LABEL[s.mode]} with ${who.join(" and ")}` : `${MODE_LABEL[s.mode]}, ${s.names.find((x) => x.toLowerCase() === s.paidBy)} paid`;
  };
  // Picked while the form still holds what the chip filled; a second tap clears it.
  const againOn = (a: Again) => {
    if (note !== a.note || (a.category && category !== a.category)) return false;
    const s = againSplit(a);
    if (!s) return !split;
    return split && paidBy === s.paidBy && mode === s.mode && namesOf(names).map((x) => x.toLowerCase()).sort().join() === s.names.map((x) => x.toLowerCase()).sort().join();
  };
  const pickAgain = (a: Again) => {
    if (againOn(a)) {
      setNote(""); setSplit(false); setNames(""); setPaidBy("me"); setMode("half"); setCustom({}); setCatSource(undefined);
      if (startCat.name) setCategory(startCat.name);
      return;
    }
    setNote(a.note);
    if (a.category) { setCategory(a.category); setCatSource({ name: a.category, from: `from ${a.note}` }); }
    const s = againSplit(a);
    setSplit(!!s); setNames(s ? s.names.join(", ") : ""); setPaidBy(s?.paidBy ?? "me"); setMode(s?.mode ?? "half"); setCustom({});
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {/* Two groups: one column on phones and in sheets; on a wide Add tab, left then right. */}
      <div className="slip-l">
      <div className="amt">
        <MoneyInput aria-label="Amount" placeholder="0.00" value={amount} onChange={setAmount} currency={currency || settings.defaultCurrency} autoFocus={!entry} />
        <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {[...new Set([settings.defaultCurrency, ...CURRENCIES, currency].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {foreign && (
        <label className="field"><b>Rate</b><input placeholder={`${settings.baseCurrency} per 1 ${currency}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      )}
      {!entry && again.length > 0 && (
        <div className="again">
          <span className="again-label" id="again-label">Again</span>
          <div className="again-row" role="group" aria-labelledby="again-label">
            {again.map((a) => {
              const on = againOn(a);
              const words = againWords(a);
              return (
                <button key={a.note} type="button" className={on ? "again-chip on" : "again-chip"} aria-pressed={on} onClick={() => pickAgain(a)}
                  aria-label={`${a.note}${words ? `, ${words}` : ""}. Fills the note, category and split.`}>
                  <b>{a.note}</b>{words && <span>{words}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Order: amount, again, note, category, account and when, split, then repeats. Save stays in view. */}
      {/* Note comes before Category now, so on the Add tab Return closes the keyboard instead of saving
          before a category is picked. In an edit sheet Return still saves. */}
      <label className="field stack"><b>Note</b><input className="notefield" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it?" enterKeyHint={entry ? undefined : "done"}
        onKeyDown={(e) => { if (!entry && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /></label>
      <div className="field stack"><b>Category{!entry && (catSource && category === catSource.name ? <span className="catfrom">{category}, {catSource.from}</span> : category === startCat.name && startCat.from && <span className="catfrom">{category}, {startCat.from}</span>)}</b><CategoryChips list={settings.categories} value={category} onChange={setCategory} compact={!entry} /></div>
      </div>
      <div className="slip-r">
      {/* Account and When share a row, each with its own caption. */}
      <div className="field pair">
        {accounts.length > 0 && (
          <label><b>Account{!entry && !someoneElsePaid && accountId && accountId === startAcct.id && <span className="tag">{startAcct.from}</span>}</b>
            {/* Someone else paid: only None. The picked account is kept in state and comes back if I paid after all. */}
            <select value={someoneElsePaid ? "" : accountId} onChange={(e) => setAccountId(e.target.value)}>
              {someoneElsePaid ? <option value="">None</option> : <>{!accountId && <option value="" disabled>Pick an account</option>}<AccountOptions accounts={accounts} /></>}
            </select></label>
        )}
        <label><b>{kind === "one-off" ? "When" : "Starts"}{card && validDate && cutoffFor(card, date) === date && <span className="tag">statement day</span>}</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>

      {billable && card && nextCut && (
        <div className="field"><b>Bill on next statement<span className="mute small sub">{labelShort(nextCut)} statement, due {labelShort(dueFor(card, nextCut))}</span></b>
          <button type="button" className={`toggle ${nextBill ? "on" : ""}`} aria-pressed={nextBill} aria-label="Bill on next statement" onClick={() => setNextBill(!nextBill)}><i /></button></div>
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
          <div className="field stack"><b>Paid by</b>
            <div className="picks" role="radiogroup" aria-label="Paid by">
              {[["me", "Me"] as const, ...picks, ...kept.map((k) => [keptKey(k.id), `${k.name} (removed)`] as const)].map(([k, n]) => (
                <button key={k} type="button" role="radio" aria-checked={k === paidBy} className={k === paidBy ? "pick on" : "pick"} onClick={() => pickPayer(k)}>{n}</button>
              ))}
            </div></div>
          {/* Only the modes that fit who paid: Even, They owe, Custom when I paid; Even, I owe, Custom when someone else did. */}
          <div className="field"><b>Mode</b><Segmented label="Mode" value={mode} options={modesFor(paidBy)} labels={MODE_LABEL} onChange={(m) => { setMode(m); setPaidBy(payerForMode(m, paidBy, names, kept)); }} /></div>
          {/* Custom: what each person owes the payer. When someone else paid, my own share too; the payer owes nothing. */}
          {mode === "custom" && paidBy !== "me" && (
            <label className="field"><b>You owe</b><MoneyInput value={custom.me ?? ""} onChange={(v) => setCustom({ ...custom, me: v })} currency={currency} /></label>
          )}
          {mode === "custom" && picks.filter(([k]) => k !== paidBy).map(([k, n]) => (
            <label className="field" key={k}><b>{n} owes</b><MoneyInput value={custom[k] ?? ""} onChange={(v) => setCustom({ ...custom, [k]: v })} currency={currency} /></label>
          ))}
          {mode === "custom" && kept.filter((k) => keptKey(k.id) !== paidBy).map((k) => (
            <label className="field" key={k.id}><b>{k.name} owes<span className="tag">removed</span></b><MoneyInput value={custom[keptKey(k.id)] ?? ""} onChange={(v) => setCustom({ ...custom, [keptKey(k.id)]: v })} currency={currency} /></label>
          ))}
          {preview && (
            <div className="splitpreview" aria-live="polite">
              {"error" in preview ? <p className="err">{preview.error}</p> : preview.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
        </>
      )}

      {!entry && (
        <div className="field"><b>Repeats</b><Segmented label="Repeats" value={kind} options={KINDS} labels={KIND_LABEL} onChange={setKind} /></div>
      )}
      {kind !== "one-off" && !entry && (
        <>
          <div className="field"><b>Every</b><Segmented label="Every" value={freq} options={FREQ} labels={FREQ_LABEL} onChange={setFreq} /></div>
          {kind === "installment" ? (
            <label className="field"><b>Payments</b><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
              <span className="mute small">amount above is the total</span></label>
          ) : (
            <label className="field"><b>Ends</b><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          )}
        </>
      )}

      {entry ? (
        <>
          {error && <p className="err" role="alert">{error}</p>}
          <div className="actions">
            <ConfirmButton danger label="Delete" ask={confirmLabel("delete", entry)} onConfirm={() => void remove()} />
            <button type="submit" className="btn">Save</button>
          </div>
        </>
      ) : (
        // The Add tab's Save bar: always in view above the tab bar (and on the keyboard), its error just above the button.
        <div className="savebar">
          {error && <p className="err" role="alert">{error}</p>}
          <button type="submit" className="btn">Save</button>
        </div>
      )}
      </div>
    </form>
  );
}
