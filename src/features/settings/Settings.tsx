import { useEffect, useState } from "react";
import { list, remove, saveSettings, upsert } from "../../data/collections";
import { CURRENCIES } from "../../data/currencies";
import { formatMinor, parseMinor } from "../../data/money";
import type { Account, Person, Settings as S } from "../../data/schema";
import { DEFAULT_SETTINGS } from "../../data/schema";
import { getSettings } from "../../data/collections";
import { useLedger } from "../../ui/Ledger";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.-]/g, "");

function AccountRow({ a, base, onSave, onRemove }: { a: Account; base: string; onSave: (a: Account) => void; onRemove: () => void }) {
  const [name, setName] = useState(a.name);
  const [currency, setCurrency] = useState(a.currency);
  const [opening, setOpening] = useState(plain(a.openingBalance, a.currency));
  const [rate, setRate] = useState(a.rate ?? "");
  const commit = (over: Partial<{ name: string; currency: string; opening: string; rate: string }> = {}) => {
    const cur = over.currency ?? currency;
    const neg = (over.opening ?? opening).trim().startsWith("-");
    const o = parseMinor((over.opening ?? opening).replace("-", ""), cur);
    if (o === null) return;
    const r = (over.rate ?? rate).trim();
    onSave({ ...a, name: (over.name ?? name).trim() || "Account", currency: cur, openingBalance: neg ? -o : o, rate: cur !== base && /^\d+(\.\d+)?$/.test(r) ? r : undefined });
  };
  return (
    <div className="acct">
      <input aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} />
      <select aria-label="Currency" value={currency} onChange={(e) => { setCurrency(e.target.value); commit({ currency: e.target.value }); }}>
        {[...new Set([...CURRENCIES, currency])].map((c) => <option key={c}>{c}</option>)}
      </select>
      <input aria-label="Opening balance" inputMode="decimal" placeholder="Opening" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => commit()} />
      {currency !== base && <input aria-label={`${base} per 1 ${currency}`} inputMode="decimal" placeholder={`${base} rate`} value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => commit()} />}
      <button className="x" aria-label={`Remove ${a.name}`} onClick={onRemove}>✕</button>
    </div>
  );
}

export function Settings() {
  const { store, rev, changed } = useLedger();
  const [s, setS] = useState<S>(DEFAULT_SETTINGS);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cat, setCat] = useState("");
  const [person, setPerson] = useState("");

  useEffect(() => {
    (async () => {
      setS(await getSettings(store));
      setPeople(await list(store, "people"));
      setAccounts(await list(store, "accounts"));
    })();
  }, [store, rev]);

  const save = async (patch: Partial<S>) => { await saveSettings(store, patch); changed(); };

  return (
    <div className="stack">
      <div className="card">
        <label className="field"><b>Default currency</b>
          <select value={s.defaultCurrency} onChange={(e) => void save({ defaultCurrency: e.target.value })}>
            {[...new Set([...CURRENCIES, s.defaultCurrency])].map((c) => <option key={c}>{c}</option>)}
          </select></label>
        <div className="field"><b>Base currency</b><span className="mute">{s.baseCurrency}</span></div>
      </div>

      <div className="grp">Accounts</div>
      <div className="card pad">
        {accounts.length === 0 && <p className="mute">No accounts yet</p>}
        {accounts.map((a) => (
          <AccountRow key={a.id + a.updatedAt} a={a} base={s.baseCurrency}
            onSave={async (x) => { await upsert(store, "accounts", x); changed(); }}
            onRemove={async () => { await remove(store, "accounts", a.id); changed(); }} />
        ))}
        <button className="btn ghost sm" onClick={async () => { await upsert(store, "accounts", { name: "New account", currency: s.baseCurrency, openingBalance: 0 }); changed(); }}>Add account</button>
      </div>

      <div className="grp">People</div>
      <div className="card pad">
        {people.map((p) => (
          <div key={p.id} className="acct">
            <input aria-label="Name" defaultValue={p.name} onBlur={async (e) => { const n = e.target.value.trim(); if (n && n !== p.name) { await upsert(store, "people", { ...p, name: n }); changed(); } }} />
            <button className="x" aria-label={`Remove ${p.name}`} onClick={async () => { await remove(store, "people", p.id); changed(); }}>✕</button>
          </div>
        ))}
        <form className="acct" onSubmit={async (e) => { e.preventDefault(); if (!person.trim()) return; await upsert(store, "people", { name: person.trim() }); setPerson(""); changed(); }}>
          <input placeholder="Add person" value={person} onChange={(e) => setPerson(e.target.value)} />
          <button className="btn ghost sm" type="submit">Add</button>
        </form>
      </div>

      <div className="grp">Categories</div>
      <div className="card pad">
        <div className="chips">
          {s.categories.map((c) => (
            <span key={c} className="chip">{c}<button aria-label={`Remove ${c}`} onClick={() => void save({ categories: s.categories.filter((x) => x !== c) })}>✕</button></span>
          ))}
        </div>
        <form className="acct" onSubmit={async (e) => { e.preventDefault(); const n = cat.trim(); if (!n || s.categories.includes(n)) return; await save({ categories: [...s.categories, n] }); setCat(""); }}>
          <input placeholder="Add category" value={cat} onChange={(e) => setCat(e.target.value)} />
          <button className="btn ghost sm" type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
