import { useEffect, useState } from "react";
import { list, remove, saveSettings, upsert } from "../../data/collections";
import { CURRENCIES } from "../../data/currencies";
import { formatMinor, parseMinor } from "../../data/money";
import type { Account, Defaults, Person, Rule, Settings as S } from "../../data/schema";
import { DEFAULT_DUE_DAYS, DEFAULT_SETTINGS, isCard } from "../../data/schema";
import { getSettings } from "../../data/collections";
import { useLedger } from "../../ui/Ledger";
import { daysLeft } from "../../sync/config";
import { bundleText, parseBundle, type Bundle } from "../../data/bundle";
import { entriesCsv, exportBundle, importBundle, validateBundle } from "../../data/exportImport";
import { loadAllEntries } from "../../data/months";
import { downloadText } from "../../ui/download";
import { pillOf } from "../../ui/Pill";
import { Sheet } from "../../ui/Sheet";
import { useSync } from "../../ui/Sync";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { AccountOptions } from "../../ui/AccountOptions";
import { applyTheme, loadTheme, saveTheme, THEMES, type Theme } from "../../ui/theme";

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
      <MoneyInput aria-label="Opening balance" placeholder="Opening" allowNegative currency={currency} value={opening} onChange={setOpening} onBlur={() => commit()} />
      {currency !== base && <input aria-label={`${base} per 1 ${currency}`} inputMode="decimal" placeholder={`${base} rate`} value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => commit()} />}
      <button className="x" aria-label={`Remove ${a.name}`} onClick={onRemove}>✕</button>
    </div>
  );
}

const dayOk = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;

/** A credit card: cut-off day, due days, optional limit and what was owed when it was added. Always in the base currency. */
function CardRow({ a, base, onSave, onRemove }: { a: Account; base: string; onSave: (a: Account) => void; onRemove: () => void }) {
  const [name, setName] = useState(a.name);
  const [day, setDay] = useState(String(a.statementDay ?? ""));
  const [dueDays, setDueDays] = useState(String(a.dueDays ?? DEFAULT_DUE_DAYS));
  const [limit, setLimit] = useState(a.limit !== undefined ? plain(a.limit, base) : "");
  const [owed, setOwed] = useState(a.openingBalance ? plain(-a.openingBalance, base) : "");
  const [error, setError] = useState("");
  const commit = () => {
    setError("");
    const d = Number(day);
    const dd = Number(dueDays);
    if (!dayOk(d, 1, 31)) return setError("Cut-off day is 1 to 31");
    if (!dayOk(dd, 0, 60)) return setError("Due is 0 to 60 days after the cut-off");
    const lim = limit.trim() ? parseMinor(limit, base) : undefined;
    if (lim === null) return setError("Enter a valid limit");
    const o = owed.trim() ? parseMinor(owed, base) : 0;
    if (o === null) return setError("Enter a valid amount owed");
    onSave({ ...a, name: name.trim() || "Card", currency: base, rate: undefined, statementDay: d, dueDays: dd, limit: lim, openingBalance: o ? -o : 0 });
  };
  return (
    <div className="cardacct">
      <div className="acct">
        <input aria-label="Card name" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} />
        <button className="x" aria-label={`Remove ${a.name}`} onClick={onRemove}>✕</button>
      </div>
      <label className="field"><b>Cut-off day</b><input aria-label="Cut-off day" inputMode="numeric" placeholder="1 to 31" value={day} onChange={(e) => setDay(e.target.value)} onBlur={commit} /></label>
      <label className="field"><b>Days until due</b><input aria-label="Days from cut-off to due date" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} onBlur={commit} /></label>
      <label className="field"><b>Credit limit</b><MoneyInput aria-label="Credit limit" placeholder="Optional" currency={base} value={limit} onChange={setLimit} onBlur={commit} /></label>
      <label className="field"><b>Owed at start</b><MoneyInput aria-label="Owed at start" placeholder="0" currency={base} value={owed} onChange={setOwed} onBlur={commit} /></label>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export function Settings({ onSetup }: { onSetup: () => void }) {
  const { store, rev, changed } = useLedger();
  const { config, status, engine, disconnect, readOnly } = useSync();
  const [lastExported, setLastExported] = useState<string>();
  const [incoming, setIncoming] = useState<Bundle>();
  const [backupMsg, setBackupMsg] = useState("");
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [confirm, setConfirm] = useState<"pull" | "remove">();
  const [dropCard, setDropCard] = useState<Account>();
  const [used, setUsed] = useState<Set<string>>(new Set());
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
      // Accounts that something refers to, so removing a card with history asks first.
      const [entries, rules] = await Promise.all([loadAllEntries(store), list(store, "rules") as Promise<Rule[]>]);
      setUsed(new Set([
        ...entries.filter((e) => !e.deleted).flatMap((e) => [e.accountId, e.toAccountId]),
        ...rules.flatMap((r) => [r.accountId, ...(r.revisions ?? []).map((x) => x.accountId)]),
      ].filter((x): x is string => !!x)));
      setLastExported(await store.getMeta<string>("lastExported"));
    })();
  }, [store, rev]);

  const save = async (patch: Partial<S>) => { await saveSettings(store, patch); changed(); };
  const saveDefault = (patch: Defaults) => save({ defaults: { ...s.defaults, ...patch } });
  const banks = accounts.filter((a) => !isCard(a));
  // A default whose account or category was removed shows as unset; new items then start as if none was set.
  const shown = (id: string | undefined, from: Account[]) => (id && from.some((a) => a.id === id) ? id : "");
  const stamp = () => new Date().toISOString().slice(0, 10);

  async function exportJson() {
    downloadText(bundleText(await exportBundle(store)), `ledger-export-${stamp()}.json`);
    await store.setMeta("lastExported", new Date().toISOString());
    setLastExported(new Date().toISOString());
    setBackupMsg("");
  }
  async function exportCsv() {
    downloadText(entriesCsv(await loadAllEntries(store), people, accounts), `ledger-entries-${stamp()}.csv`, "text/csv");
  }
  async function pickFile(f: File | undefined) {
    setBackupMsg("");
    if (!f) return;
    try {
      const b = parseBundle(await f.text());
      const errs = validateBundle(b);
      if (errs.length) throw new Error(`${errs[0]}${errs.length > 1 ? ` (and ${errs.length - 1} more)` : ""}`);
      setIncoming(b);
    } catch (e) {
      setBackupMsg(e instanceof Error && !/JSON/.test(e.message) ? `Cannot import: ${e.message}` : "That is not a Ledger export");
    }
  }
  async function doImport() {
    if (!incoming) return;
    try {
      const r = await importBundle(store, incoming);
      setBackupMsg(`Imported ${r.newEntries} new ${r.newEntries === 1 ? "entry" : "entries"}`);
      changed();
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : "Import failed");
    }
    setIncoming(undefined);
  }

  return (
    <div className="stack">
      <div className="grp">Backup</div>
      <div className="card">
        <div className="field"><b>Export</b>
          <span className="acts">
            <button className="btn ghost sm" onClick={() => void exportJson()}>Backup file</button>
            <button className="btn ghost sm" onClick={() => void exportCsv()}>Spreadsheet</button>
          </span></div>
        <fieldset className="plain" disabled={readOnly}>
          <div className="field"><b>Import</b>
            <label className="btn ghost sm filebtn">Choose file<input type="file" accept=".json,application/json" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        </fieldset>
        <div className="field"><b>Last exported</b><span className="mute">{sinceText(lastExported)}</span></div>
        {backupMsg && <p className="mute small" role="status">{backupMsg}</p>}
      </div>

      <fieldset className="plain" disabled={readOnly}>
      <div className="grp">Sync</div>
      <div className="card">
        <div className="field"><b>Status</b><span className="mute">{pillOf(status).label}</span></div>
        {config ? (
          <>
            <div className="field"><b>Data repo</b><span className="mute">{config.owner}/{config.repo}</span></div>
            <div className="field"><b>Token</b><span className="mute">{tokenLine(daysLeft(config), config.tokenExpires)}</span></div>
            <div className="field"><b>Connection</b>
              <span className="acts">
                <button className="btn ghost sm" onClick={onSetup}>Replace token</button>
                <button className="btn ghost sm" onClick={() => setConfirm("pull")}>Re-pull</button>
                <button className="btn ghost sm danger" onClick={() => setConfirm("remove")}>Remove</button>
              </span></div>
          </>
        ) : (
          <div className="field"><b>GitHub</b><button className="btn sm" onClick={onSetup}>Connect</button></div>
        )}
      </div>

      <div className="grp">General</div>
      <div className="card">
        <label className="field"><b>Default currency</b>
          <select value={s.defaultCurrency} onChange={(e) => void save({ defaultCurrency: e.target.value })}>
            {[...new Set([...CURRENCIES, s.defaultCurrency])].map((c) => <option key={c}>{c}</option>)}
          </select></label>
        <div className="field"><b>Base currency</b><span className="mute">{s.baseCurrency}</span></div>
        <div className="field"><b>Appearance</b>
          <Segmented value={theme} options={THEMES} labels={{ light: "Light", dark: "Dark", auto: "Auto" }} onChange={(t) => { setThemeState(t); saveTheme(t); applyTheme(t); }} /></div>
      </div>

      <div className="grp">Bank accounts</div>
      <div className="card pad">
        {!accounts.some((a) => !isCard(a)) && <p className="mute">No bank accounts yet</p>}
        {accounts.filter((a) => !isCard(a)).map((a) => (
          <AccountRow key={a.id + a.updatedAt} a={a} base={s.baseCurrency}
            onSave={async (x) => { await upsert(store, "accounts", x); changed(); }}
            onRemove={async () => { await remove(store, "accounts", a.id); changed(); }} />
        ))}
        <button className="btn ghost sm" onClick={async () => { await upsert(store, "accounts", { name: "New account", currency: s.baseCurrency, openingBalance: 0 }); changed(); }}>Add account</button>
      </div>

      <div className="grp">Credit cards</div>
      <div className="card pad">
        {!accounts.some(isCard) && <p className="mute">No cards yet</p>}
        {accounts.filter(isCard).map((a) => (
          <CardRow key={a.id + a.updatedAt} a={a} base={s.baseCurrency}
            onSave={async (x) => { await upsert(store, "accounts", x); changed(); }}
            onRemove={async () => { if (used.has(a.id)) setDropCard(a); else { await remove(store, "accounts", a.id); changed(); } }} />
        ))}
        <button className="btn ghost sm" onClick={async () => { await upsert(store, "accounts", { name: "New card", currency: s.baseCurrency, openingBalance: 0, type: "card", statementDay: 15, dueDays: DEFAULT_DUE_DAYS }); changed(); }}>Add card</button>
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

      <div className="grp">Defaults</div>
      <div className="card">
        {accounts.length > 0 && (
          <label className="field"><b>Expenses</b>
            <select value={shown(s.defaults?.expense, accounts)} onChange={(e) => void saveDefault({ expense: e.target.value || undefined })}>
              <option value="">Pick each time</option><AccountOptions accounts={accounts} />
            </select></label>
        )}
        {banks.length > 0 && (
          <>
            <label className="field"><b>Income</b>
              <select value={shown(s.defaults?.income, banks)} onChange={(e) => void saveDefault({ income: e.target.value || undefined })}>
                <option value="">First bank account</option>{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
            <label className="field"><b>Card payments from</b>
              <select value={shown(s.defaults?.cardPayment, banks)} onChange={(e) => void saveDefault({ cardPayment: e.target.value || undefined })}>
                <option value="">Salary account</option>{banks.filter((a) => a.currency === s.baseCurrency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
          </>
        )}
        <label className="field"><b>Category</b>
          <select value={s.defaults?.category && s.categories.includes(s.defaults.category) ? s.defaults.category : s.categories[0] ?? ""} onChange={(e) => void saveDefault({ category: e.target.value })}>
            {s.categories.map((c) => <option key={c}>{c}</option>)}
          </select></label>
        <div className="field"><b>Use last used instead<span className="mute small sub">Overrides the defaults above, on this device</span></b>
          <button type="button" className={`toggle ${s.defaults?.lastUsed ? "on" : ""}`} aria-pressed={!!s.defaults?.lastUsed} onClick={() => void saveDefault({ lastUsed: !s.defaults?.lastUsed || undefined })}><i /></button></div>
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
      </fieldset>

      {incoming && (
        <Sheet onClose={() => setIncoming(undefined)}>
          <h3>Import backup</h3>
          <p className="mute">
            Adds {count(incoming)} from a file exported {incoming.exportedAt.slice(0, 10)}.
            Nothing here is deleted; where both have the same entry, the newest edit wins.
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setIncoming(undefined)}>Cancel</button>
            <button className="btn" onClick={() => void doImport()}>Import</button>
          </div>
        </Sheet>
      )}

      {dropCard && (
        <Sheet locked onClose={() => setDropCard(undefined)}>
          <h3>Remove {dropCard.name}</h3>
          <p className="mute">
            This card has entries. They stay in the Ledger, but without the card they count as money that left no account ("Other"), not as card charges. Change their account first if you want to keep them on a card.
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setDropCard(undefined)}>Cancel</button>
            <button className="btn ghost danger" onClick={async () => { await remove(store, "accounts", dropCard.id); setDropCard(undefined); changed(); }}>Remove</button>
          </div>
        </Sheet>
      )}

      {confirm && (
        <Sheet onClose={() => setConfirm(undefined)}>
          <h3>{confirm === "pull" ? "Re-pull from GitHub" : "Remove token"}</h3>
          <p className="mute">
            {confirm === "pull"
              ? "Replaces this device with what is on GitHub. Anything not yet synced is saved to Downloads first."
              : "Wipes the token from this browser. Your data stays on this device, but it will no longer sync."}
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirm(undefined)}>Cancel</button>
            <button className="btn" onClick={() => { if (confirm === "pull") void engine.resolve("remote"); else disconnect(); setConfirm(undefined); }}>
              {confirm === "pull" ? "Re-pull" : "Remove"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function count(b: Bundle): string {
  const n = Object.values(b.files).reduce((a, d) => a + ((d.entries as unknown[] | undefined)?.length ?? 0), 0);
  return `${n} ${n === 1 ? "entry" : "entries"}`;
}

function sinceText(iso?: string): string {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function tokenLine(days: number | undefined, date?: string): string {
  if (days === undefined) return "No expiry date saved";
  if (days < 0) return `Expired ${date}`;
  if (days <= 30) return `Expires in ${days} ${days === 1 ? "day" : "days"}. Renew soon`;
  return `Expires ${date}`;
}
