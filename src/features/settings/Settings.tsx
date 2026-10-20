import { useEffect, useRef, useState } from "react";
import { list, listAll, remove, restore, saveSettings, upsert } from "../../data/collections";
import { moveAndRemove } from "../../data/accountMove";
import { CURRENCIES } from "../../data/currencies";
import { formatMinor } from "../../data/money";
import type { Account, Defaults, Entry, Person, Rule, Settings as S } from "../../data/schema";
import { DEFAULT_DUE_DAYS, DEFAULT_SETTINGS, isCard } from "../../data/schema";
import { getSettings } from "../../data/collections";
import { CARD_COLORS, CARD_COLOR_LABEL, cardColor, type CardColor } from "../../ui/cardColor";
import { useLedger } from "../../ui/Ledger";
import { daysLeft } from "../../sync/config";
import { bundleText, parseBundle, type Bundle } from "../../data/bundle";
import { entriesCsv, exportBundle, importBundle, validateBundle } from "../../data/exportImport";
import { loadAllEntries } from "../../data/months";
import { accountBalances } from "../../data/accounts";
import { nonZero } from "../../data/balances";
import { today } from "../../data/dates";
import { accountUsage, personUsage, usageText } from "../../data/usage";
import { itemsToDate } from "../../data/world";
import { downloadText } from "../../ui/download";
import { pillOf } from "../../ui/Pill";
import { Sheet } from "../../ui/Sheet";
import { useSync } from "../../ui/Sync";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { AccountOptions } from "../../ui/AccountOptions";
import { applyTheme, loadTheme, saveTheme, THEMES, type Theme } from "../../ui/theme";
import { accountEdit, cardEdit } from "./accountEdit";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.-]/g, "");

/** "Saved" for a moment next to a row's ✕ after a real change (the flag lives in Settings, so it survives the row reloading). */
const SavedTick = ({ on }: { on?: boolean }) => (on ? <span className="savedtick" role="status">Saved</span> : null);

function AccountRow({ a, base, saved, onSave, onRemove }: { a: Account; base: string; saved?: boolean; onSave: (a: Account) => void; onRemove: () => void }) {
  const [name, setName] = useState(a.name);
  const [currency, setCurrency] = useState(a.currency);
  const [opening, setOpening] = useState(plain(a.openingBalance, a.currency));
  const [rate, setRate] = useState(a.rate ?? "");
  // Only a real change is saved (an unchanged blur writes nothing); an unreadable balance is ignored, as before.
  const commit = (over: Partial<{ name: string; currency: string; opening: string; rate: string }> = {}) => {
    const r = accountEdit(a, { name, currency, opening, rate, ...over }, base);
    if (r && "account" in r) onSave(r.account);
  };
  // Same shape as a card: name and ✕, then labelled fields. The opening balance is what the account
  // held before the first entry logged on it; today's bank balance would count earlier entries twice.
  return (
    <div className="cardacct">
      <div className="acct">
        <input aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} />
        <SavedTick on={saved} />
        <button className="x" aria-label={`Remove ${a.name}`} onClick={onRemove}>✕</button>
      </div>
      <label className="field"><b>Currency</b>
        <select aria-label="Currency" value={currency} onChange={(e) => { setCurrency(e.target.value); commit({ currency: e.target.value }); }}>
          {[...new Set([...CURRENCIES, currency])].map((c) => <option key={c}>{c}</option>)}
        </select></label>
      <label className="field wide"><b>Balance before your first entry<span className="mute small sub">Use today's balance only if nothing is logged yet</span></b>
        <MoneyInput aria-label="Balance before your first entry" placeholder="0" allowNegative currency={currency} value={opening} onChange={setOpening} onBlur={() => commit()} /></label>
      {currency !== base && (
        <label className="field"><b>{base} per 1 {currency}</b>
          <input aria-label={`${base} per 1 ${currency}`} inputMode="decimal" placeholder="Rate" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => commit()} /></label>
      )}
    </div>
  );
}

/** A credit card: cut-off day, due days, optional limit, what was owed when it was added and its colour. Always in the base currency. */
function CardRow({ a, base, color, saved, onSave, onRemove }: { a: Account; base: string; color: CardColor; saved?: boolean; onSave: (a: Account) => void; onRemove: () => void }) {
  const [name, setName] = useState(a.name);
  const [day, setDay] = useState(String(a.statementDay ?? ""));
  const [dueDays, setDueDays] = useState(String(a.dueDays ?? DEFAULT_DUE_DAYS));
  const [limit, setLimit] = useState(a.limit !== undefined ? plain(a.limit, base) : "");
  const [owed, setOwed] = useState(a.openingBalance ? plain(-a.openingBalance, base) : "");
  const [error, setError] = useState("");
  // Saves from the fields as typed, so tapping a colour right after typing a name keeps the name.
  // Only a real change is saved (an unchanged blur writes nothing).
  const commit = (extra: Partial<Account> = {}) => {
    setError("");
    const r = cardEdit(a, { name, day, dueDays, limit, owed }, base, extra);
    if (r && "error" in r) return setError(r.error);
    if (r) onSave(r.account);
  };
  return (
    <div className="cardacct" id={`card-${a.id}`}>
      <div className="acct">
        <input aria-label="Card name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} />
        <SavedTick on={saved} />
        <button className="x" aria-label={`Remove ${a.name}`} onClick={onRemove}>✕</button>
      </div>
      <label className="field"><b>Cut-off day</b><input aria-label="Cut-off day" inputMode="numeric" placeholder="1 to 31" value={day} onChange={(e) => setDay(e.target.value)} onBlur={() => commit()} /></label>
      <label className="field"><b>Days until due</b><input aria-label="Days from cut-off to due date" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} onBlur={() => commit()} /></label>
      <label className="field"><b>Credit limit</b><MoneyInput aria-label="Credit limit" placeholder="Optional" currency={base} value={limit} onChange={setLimit} onBlur={() => commit()} /></label>
      <label className="field"><b>Owed at start</b><MoneyInput aria-label="Owed at start" placeholder="0" currency={base} value={owed} onChange={setOwed} onBlur={() => commit()} /></label>
      <div className="field"><b>Colour</b>
        <div className="swatches" role="radiogroup" aria-label={`${a.name} colour`}>
          {CARD_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={CARD_COLOR_LABEL[c]} className={c === color ? `swatch face-${c} on` : `swatch face-${c}`} onClick={() => c !== color && commit({ color: c })} />
          ))}
        </div>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export type Page = "accounts" | "people" | "general" | "sync";
/** Settings opens on a short list of pages, each a group of the old long page. */
const PAGES: [Page, string][] = [["general", "General"], ["accounts", "Accounts"], ["people", "People and categories"], ["sync", "Sync and backup"]];
const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", auto: "Auto" };

/** `focusCard` (from Reconcile, "Set as Owed at start") opens Accounts and scrolls that card into view once loaded. */
export function Settings({ onSetup, focusCard, initialPage }: { onSetup: () => void; focusCard?: string; initialPage?: Page }) {
  const { store, rev, changed } = useLedger();
  const { config, status, engine, disconnect, readOnly } = useSync();
  const [lastExported, setLastExported] = useState<string>();
  const [incoming, setIncoming] = useState<Bundle>();
  const [backupMsg, setBackupMsg] = useState("");
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [confirm, setConfirm] = useState<"pull" | "remove">();
  // A person or account that is in use: removing it asks first and says what it affects.
  // An account in use can first move its entries, plans and defaults to `targets` (same kind; banks in the same currency).
  const [drop, setDrop] = useState<{ kind: "people" | "accounts"; id: string; name: string; lines: string[]; targets?: Account[]; none?: string }>();
  const [moveTo, setMoveTo] = useState("");
  const [dropErr, setDropErr] = useState("");
  const [refs, setRefs] = useState<{ entries: Entry[]; rules: Rule[] }>({ entries: [], rules: [] });
  const [s, setS] = useState<S>(DEFAULT_SETTINGS);
  const [people, setPeople] = useState<Person[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Removed accounts, newest removed first, so one can be brought back with the same id.
  const [removed, setRemoved] = useState<Account[]>([]);
  const [cat, setCat] = useState("");
  // Category chips show their ✕ only in Edit mode, so a stray tap cannot remove one.
  const [editCats, setEditCats] = useState(false);
  // Read once on mount (the page resets per tab): Reconcile's card, or the Add tab's "Open Settings".
  const [page, setPage] = useState<Page | undefined>(focusCard ? "accounts" : initialPage);
  const [person, setPerson] = useState("");

  useEffect(() => {
    (async () => {
      setS(await getSettings(store));
      setPeople(await list(store, "people"));
      const all = await listAll(store, "accounts");
      setAccounts(all.filter((a) => !a.deleted));
      setRemoved(all.filter((a) => a.deleted).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
      // What refers to people and accounts, so removing one in use asks first.
      const [entries, rules] = await Promise.all([loadAllEntries(store), list(store, "rules") as Promise<Rule[]>]);
      setRefs({ entries, rules });
      setLastExported(await store.getMeta<string>("lastExported"));
    })();
  }, [store, rev]);

  useEffect(() => { if (focusCard) setPage("accounts"); }, [focusCard]);
  useEffect(() => {
    if (focusCard && accounts.length) document.getElementById(`card-${focusCard}`)?.scrollIntoView({ block: "center" });
  }, [focusCard, accounts.length]);

  const save = async (patch: Partial<S>) => { await saveSettings(store, patch); changed(); };
  // Rows (accounts, cards, people) that just saved a real change show "Saved" for 1.5 s.
  const [savedIds, setSavedIds] = useState<Record<string, true>>({});
  const tickTimers = useRef(new Map<string, number>());
  useEffect(() => () => { for (const t of tickTimers.current.values()) window.clearTimeout(t); }, []);
  const markSaved = (id: string) => {
    setSavedIds((x) => ({ ...x, [id]: true }));
    window.clearTimeout(tickTimers.current.get(id));
    tickTimers.current.set(id, window.setTimeout(() => setSavedIds(({ [id]: _gone, ...rest }) => rest), 1500));
  };
  const saveDefault = (patch: Defaults) => save({ defaults: { ...s.defaults, ...patch } });
  const banks = accounts.filter((a) => !isCard(a));
  // A default whose account or category was removed shows as unset; new items then start as if none was set.
  const shown = (id: string | undefined, from: Account[]) => (id && from.some((a) => a.id === id) ? id : "");
  const stamp = () => new Date().toISOString().slice(0, 10);

  async function removeNow(kind: "people" | "accounts", id: string) {
    await remove(store, kind, id);
    setDrop(undefined);
    changed();
  }
  async function moveThenRemove(id: string) {
    setDropErr("");
    try {
      await moveAndRemove(store, id, moveTo);
      setDrop(undefined);
      changed();
    } catch (e) {
      setDropErr(e instanceof Error ? e.message : "Could not move");
    }
  }
  function askAccount(d: NonNullable<typeof drop>) {
    setMoveTo(d.targets?.[0]?.id ?? "");
    setDropErr("");
    setDrop(d);
  }
  function askRemovePerson(p: Person) {
    const u = personUsage(p.id, refs.entries, refs.rules, itemsToDate(refs, today()));
    const owed = nonZero(u.owed);
    if (!u.entries && !u.plans && !owed.length) return void removeNow("people", p.id);
    const amts = (xs: [string, number][]) => xs.map(([c, v]) => formatMinor(Math.abs(v), c)).join(" and ");
    const theyOwe = owed.filter(([, v]) => v > 0);
    const iOwe = owed.filter(([, v]) => v < 0);
    const on = usageText(u);
    setDrop({ kind: "people", id: p.id, name: p.name, lines: [
      [on && `${p.name} is on ${on}.`, theyOwe.length ? `${p.name} owes you ${amts(theyOwe)}.` : "", iOwe.length ? `You owe ${p.name} ${amts(iOwe)}.` : "", !owed.length ? "Settled up." : ""].filter(Boolean).join(" "),
      `The entries stay in the Ledger and keep the split, but ${p.name} leaves Splits${owed.length ? ", Owed to you and the forecast" : ""}. Adding ${p.name} again makes a new person; it does not bring these back.`,
    ] });
  }
  function askRemoveAccount(a: Account) {
    const u = accountUsage(a.id, refs.entries, refs.rules);
    const on = usageText(u);
    if (isCard(a)) {
      if (!u.entries && !u.plans) return void removeNow("accounts", a.id);
      const targets = accounts.filter((x) => isCard(x) && x.id !== a.id);
      return askAccount({ kind: "accounts", id: a.id, name: a.name, targets, none: "Add another card to move them to.", lines: [
        `${a.name} has ${on}.`,
        targets.length
          ? `Move them, and any default set to ${a.name}, to another card first. If you remove it anyway, they stay in the Ledger but count as money from no account ("Other"), not as card charges.`
          : 'If you remove it, they stay in the Ledger but count as money from no account ("Other"), not as card charges.',
        a.openingBalance ? `Its owed at start of ${formatMinor(-a.openingBalance, a.currency)} goes with it.` : "",
      ].filter(Boolean) });
    }
    const balance = accountBalances([a], itemsToDate(refs, today()), s.baseCurrency).accounts[0]?.balance ?? a.openingBalance;
    if (!u.entries && !u.plans && !balance && !a.openingBalance) return void removeNow("accounts", a.id);
    // Only worth moving when something refers to it; same currency, so the total stays the same.
    const targets = on ? banks.filter((x) => x.id !== a.id && x.currency === a.currency) : undefined;
    askAccount({ kind: "accounts", id: a.id, name: a.name, targets, none: `Add another ${a.currency} bank account to move them to.`, lines: [
      `${on ? `${a.name} has ${on}. Balance` : `${a.name} has a balance of`} ${formatMinor(balance, a.currency)}.`,
      [
        on && (targets?.length
          ? `Move them, and any default set to ${a.name}, to another bank account first. If you remove it anyway, they stay in the Ledger but count as money from no account ("Other").`
          : 'If you remove it, the entries stay in the Ledger but count as money from no account ("Other").'),
        a.openingBalance ? `Its opening balance of ${formatMinor(a.openingBalance, a.currency)} leaves your total.` : "",
      ].filter(Boolean).join(" "),
    ].filter(Boolean) });
  }

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

  const go = (p?: Page) => { setPage(p); setEditCats(false); window.scrollTo(0, 0); };
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const summary: Record<Page, string> = {
    accounts: `${n(banks.length, "bank account", "bank accounts")}, ${n(accounts.length - banks.length, "card", "cards")}`,
    people: `${n(people.length, "person", "people")}, ${n(s.categories.length, "category", "categories")}`,
    general: `${s.defaultCurrency}, ${THEME_LABEL[theme]}`,
    sync: `${pillOf(status).label}, ${lastExported ? `exported ${sinceText(lastExported).toLowerCase()}` : "never exported"}`,
  };
  const sheets = (
    <>
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

      {drop && (
        <Sheet locked onClose={() => setDrop(undefined)}>
          <h3>Remove {drop.name}</h3>
          {drop.lines.map((l) => <p key={l} className="mute">{l}</p>)}
          {drop.targets && (drop.targets.length ? (
            <label className="field"><b>Move to</b>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{drop.targets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          ) : <p className="mute small">{drop.none}</p>)}
          {dropErr && <p className="err" role="alert">{dropErr}</p>}
          <div className="actions wrap">
            <button className="btn ghost" onClick={() => setDrop(undefined)}>Cancel</button>
            <button className="btn ghost danger" onClick={() => void removeNow(drop.kind, drop.id)}>{drop.targets?.length ? "Remove anyway" : "Remove"}</button>
            {!!drop.targets?.length && <button className="btn" onClick={() => void moveThenRemove(drop.id)}>Move to {drop.targets.find((a) => a.id === moveTo)?.name} and remove</button>}
          </div>
        </Sheet>
      )}

      {confirm && (
        <Sheet onClose={() => setConfirm(undefined)}>
          <h3>{confirm === "pull" ? "Download again from GitHub" : "Remove token"}</h3>
          <p className="mute">
            {confirm === "pull"
              ? "Replaces this device with what is on GitHub. Anything not yet synced is saved to Downloads first."
              : "Wipes the token from this browser. Your data stays on this device, but it will no longer sync."}
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirm(undefined)}>Cancel</button>
            <button className="btn" onClick={() => { if (confirm === "pull") void engine.resolve("remote"); else disconnect(); setConfirm(undefined); }}>
              {confirm === "pull" ? "Download again" : "Remove"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );

  if (!page) {
    return (
      <div className="stack">
        <div className="card">
          {PAGES.map(([p, title]) => (
            <button key={p} className="row" onClick={() => go(p)}><span>{title}<span className="mute small sub">{summary[p]}</span></span></button>
          ))}
        </div>
        {sheets}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="toolrow"><span className="nav"><button className="title" onClick={() => go()}>‹ Settings</button></span></div>
      <h2 className="ptitle">{PAGES.find(([p]) => p === page)![1]}</h2>
      {page === "sync" && (
        <>
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
                      <button className="btn ghost sm" onClick={() => setConfirm("pull")}>Download again</button>
                      <button className="btn ghost sm danger" onClick={() => setConfirm("remove")}>Remove</button>
                    </span></div>
                </>
              ) : (
                <div className="field"><b>GitHub</b><button className="btn sm" onClick={onSetup}>Connect</button></div>
              )}
            </div>
          </fieldset>
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
        </>
      )}
      {page !== "sync" && (
        <fieldset className="plain" disabled={readOnly}>
          {page === "general" && (
            <>
              <div className="card">
                <label className="field"><b>Default currency</b>
                  <select value={s.defaultCurrency} onChange={(e) => void save({ defaultCurrency: e.target.value })}>
                    {[...new Set([...CURRENCIES, s.defaultCurrency])].map((c) => <option key={c}>{c}</option>)}
                  </select></label>
                <div className="field"><b>Base currency</b><span className="mute">{s.baseCurrency}</span></div>
                <div className="field"><b>Appearance</b>
                  <Segmented value={theme} options={THEMES} labels={THEME_LABEL} onChange={(t) => { setThemeState(t); saveTheme(t); applyTheme(t); }} /></div>
              </div>
            </>
          )}
          {page === "accounts" && (
            <>
              <div className="grp">Bank accounts</div>
              <div className="card pad">
                {!accounts.some((a) => !isCard(a)) && <p className="mute">No bank accounts yet</p>}
                {accounts.filter((a) => !isCard(a)).map((a) => (
                  <AccountRow key={a.id + a.updatedAt} a={a} base={s.baseCurrency} saved={!!savedIds[a.id]}
                    onSave={async (x) => { await upsert(store, "accounts", x); changed(); markSaved(a.id); }}
                    onRemove={() => askRemoveAccount(a)} />
                ))}
                <button className="btn ghost sm" onClick={async () => { await upsert(store, "accounts", { name: "New account", currency: s.baseCurrency, openingBalance: 0 }); changed(); }}>Add account</button>
              </div>

              <div className="grp">Credit cards</div>
              <div className="card pad">
                {!accounts.some(isCard) && <p className="mute">No cards yet</p>}
                {accounts.filter(isCard).map((a) => (
                  <CardRow key={a.id + a.updatedAt} a={a} base={s.baseCurrency} color={cardColor(a, accounts)} saved={!!savedIds[a.id]}
                    onSave={async (x) => { await upsert(store, "accounts", x); changed(); markSaved(a.id); }}
                    onRemove={() => askRemoveAccount(a)} />
                ))}
                <button className="btn ghost sm" onClick={async () => { await upsert(store, "accounts", { name: "New card", currency: s.baseCurrency, openingBalance: 0, type: "card", statementDay: 15, dueDays: DEFAULT_DUE_DAYS }); changed(); }}>Add card</button>
              </div>

              {removed.length > 0 && (
                <>
                  <div className="grp">Removed</div>
                  <div className="card">
                    {removed.map((a) => (
                      <div key={a.id} className="field"><b>{a.name}<span className="mute small sub">{isCard(a) ? "Card" : `Bank account, ${a.currency}`}</span></b>
                        <button className="btn ghost sm" onClick={async () => { await restore(store, "accounts", a.id); changed(); }}>Restore</button></div>
                    ))}
                  </div>
                </>
              )}

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
                  <button type="button" className={`toggle ${s.defaults?.lastUsed ? "on" : ""}`} aria-pressed={!!s.defaults?.lastUsed} aria-label="Use last used instead" onClick={() => void saveDefault({ lastUsed: !s.defaults?.lastUsed || undefined })}><i /></button></div>
              </div>
            </>
          )}
          {page === "people" && (
            <>
              <div className="grp">People</div>
              <div className="card pad">
                {people.map((p) => (
                  <div key={p.id} className="acct">
                    <input aria-label="Name" defaultValue={p.name} onBlur={async (e) => { const n = e.target.value.trim(); if (n && n !== p.name) { await upsert(store, "people", { ...p, name: n }); changed(); markSaved(p.id); } }} />
                    <SavedTick on={!!savedIds[p.id]} />
                    <button className="x" aria-label={`Remove ${p.name}`} onClick={() => askRemovePerson(p)}>✕</button>
                  </div>
                ))}
                <form className="acct" onSubmit={async (e) => { e.preventDefault(); if (!person.trim()) return; await upsert(store, "people", { name: person.trim() }); setPerson(""); changed(); }}>
                  <input aria-label="Add person" placeholder="Add person" value={person} onChange={(e) => setPerson(e.target.value)} />
                  <button className="btn ghost sm" type="submit">Add</button>
                </form>
              </div>

              <div className="grp">Categories<button type="button" className="r link" aria-pressed={editCats} onClick={() => setEditCats(!editCats)}>{editCats ? "Done" : "Edit"}</button></div>
              <div className="card pad">
                <div className={`chips${editCats ? " editing" : ""}`}>
                  {s.categories.map((c) => (
                    <span key={c} className="chip">{c}{editCats && <button type="button" aria-label={`Remove ${c}`} onClick={() => void save({ categories: s.categories.filter((x) => x !== c) })}>✕</button>}</span>
                  ))}
                </div>
                <form className="acct" onSubmit={async (e) => { e.preventDefault(); const n = cat.trim(); if (!n || s.categories.includes(n)) return; await save({ categories: [...s.categories, n] }); setCat(""); }}>
                  <input aria-label="Add category" placeholder="Add category" value={cat} onChange={(e) => setCat(e.target.value)} />
                  <button className="btn ghost sm" type="submit">Add</button>
                </form>
              </div>
            </>
          )}
        </fieldset>
      )}
      {sheets}
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
