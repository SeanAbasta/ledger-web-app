import { useEffect, useRef, useState } from "react";
import { getSettings, list } from "../../data/collections";
import { CURRENCIES } from "../../data/currencies";
import { today } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import type { Account, Settings, Trip } from "../../data/schema";
import { DEFAULT_SETTINGS } from "../../data/schema";
import { addTrip, updateTrip } from "../../data/tripOps";
import { AccountOptions } from "../../ui/AccountOptions";
import { useLedger } from "../../ui/Ledger";
import { MoneyInput } from "../../ui/MoneyInput";
import { useKeyboardInset } from "../../ui/useKeyboardInset";

type Row = { currency: string; rate: string };

// What was typed on Add > Trip and not planned yet, kept while another room is open (like the other kinds).
// Nothing is stored: it lasts until the trip is planned or the page is reloaded.
let kept: { name: string; start: string; days: string; budget: string; accountId: string; currency: string; rows: Row[] } | undefined;

/**
 * Plan a trip (Add > Trip) or edit an open one (a sheet inside the trip). A trip is a name, a start and a
 * number of days, an overall budget in the base currency, the card new expenses start on, and an estimated
 * rate for each foreign currency. The rates are only estimates: the statement amount replaces them.
 */
export function TripForm({ trip, onDone }: { trip?: Trip; onDone: (t: Trip) => void }) {
  const { store, changed } = useLedger();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState(trip?.name ?? kept?.name ?? "");
  const [start, setStart] = useState(trip?.start ?? kept?.start ?? today());
  const [days, setDays] = useState(String(trip?.days ?? kept?.days ?? 7));
  const [budget, setBudget] = useState(trip ? "" : kept?.budget ?? "");
  const [accountId, setAccountId] = useState(trip?.accountId ?? kept?.accountId ?? "");
  const [rows, setRows] = useState<Row[]>(trip ? Object.entries(trip.rates).map(([currency, rate]) => ({ currency, rate })) : kept?.rows ?? []);
  const [currency, setCurrency] = useState(trip?.currency ?? kept?.currency ?? "");
  const [error, setError] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings(store);
      setSettings(s);
      setAccounts(await list(store, "accounts"));
      if (trip?.budget !== undefined) setBudget(formatMinor(trip.budget, s.baseCurrency).replace(/[^\d.]/g, ""));
    })();
  }, [store, trip]);

  useKeyboardInset(!trip);
  useEffect(() => {
    if (trip) return;
    kept = name.trim() || budget.trim() ? { name, start, days, budget, accountId, currency, rows } : undefined;
  });
  const base = settings.baseCurrency;
  const foreign = [...new Set(CURRENCIES.filter((c) => c !== base))];
  // The trip's own currency leads the rate list; more can be added.
  const rateRows: Row[] = currency && currency !== base && !rows.some((r) => r.currency === currency) ? [{ currency, rate: "" }, ...rows] : rows;
  const setRate = (c: string, rate: string) => setRows(rateRows.map((r) => (r.currency === c ? { ...r, rate } : r)));
  const dropRate = (c: string) => setRows(rateRows.filter((r) => r.currency !== c));
  const addRow = () => {
    const next = foreign.find((c) => !rateRows.some((r) => r.currency === c));
    if (next) setRows([...rateRows, { currency: next, rate: "" }]);
  };
  const pickRowCurrency = (old: string, c: string) => setRows(rateRows.map((r) => (r.currency === old ? { ...r, currency: c } : r)));

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setError("");
    try {
      if (!name.trim()) return setError("Name the trip");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return setError("Pick a start date");
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1) return setError("Days must be 1 or more");
      let cap: number | undefined;
      if (budget.trim()) {
        cap = parseMinor(budget, base) ?? undefined;
        if (cap === undefined) return setError("Enter a budget amount");
      }
      const rates: Record<string, string> = {};
      for (const r of rateRows) {
        if (!r.rate.trim() && r.currency !== currency) continue;
        if (!/^\d+(\.\d+)?$/.test(r.rate)) return setError(`Enter an estimated rate for ${r.currency}`);
        rates[r.currency] = r.rate;
      }
      const input = { name, start, days: n, budget: cap, accountId: accountId || undefined, currency: currency || undefined, rates };
      const saved = trip ? await updateTrip(store, trip.id, input) : await addTrip(store, input);
      changed();
      if (!trip) kept = undefined;
      onDone(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      saving.current = false;
    }
  }

  return (
    <form className="form tripform" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="slip-l">
        <label className="field stack"><b>Name</b><input className="notefield" value={name} onChange={(e) => setName(e.target.value)} placeholder="Where are you going?" autoFocus={!trip} enterKeyHint="next" /></label>
        <div className="field pair">
          <label><b>Starts</b><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label><b>Days</b><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></label>
        </div>
        <label className="field"><b>Budget<span className="mute small sub">in {base}, for the whole trip</span></b><MoneyInput value={budget} onChange={setBudget} currency={base} placeholder="Optional" /></label>
      </div>
      <div className="slip-r">
        {accounts.length > 0 && (
          <label className="field"><b>Paid with<span className="mute small sub">New expenses start here</span></b>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              <AccountOptions accounts={accounts} />
            </select></label>
        )}
        <label className="field"><b>Main currency<span className="mute small sub">For new expenses</span></b>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">{base} (home)</option>
            {foreign.map((c) => <option key={c}>{c}</option>)}
          </select></label>
        {rateRows.length > 0 && (
          <div className="field stack"><b>Estimated rates<span className="mute small sub">{base} per 1 unit. Typed by hand, replaced by the statement.</span></b>
            {rateRows.map((r) => (
              <div className="raterow" key={r.currency}>
                <select aria-label="Currency" value={r.currency} onChange={(e) => pickRowCurrency(r.currency, e.target.value)}>
                  {foreign.filter((c) => c === r.currency || !rateRows.some((x) => x.currency === c)).map((c) => <option key={c}>{c}</option>)}
                </select>
                <input aria-label={`${r.currency} rate`} inputMode="decimal" placeholder={`${base} per 1 ${r.currency}`} value={r.rate} onChange={(e) => setRate(r.currency, e.target.value)} />
                {r.currency !== currency && <button type="button" className="btn ghost sm" onClick={() => dropRate(r.currency)}>Remove</button>}
              </div>
            ))}
          </div>
        )}
        {rateRows.length < foreign.length && <div className="field"><button type="button" className="btn ghost sm" onClick={addRow}>{rateRows.length ? "Add another currency" : "Add a currency rate"}</button></div>}
        {trip ? (
          <>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="actions"><button type="submit" className="btn">Save</button></div>
          </>
        ) : (
          <div className="savebar">
            {error && <p className="err" role="alert">{error}</p>}
            <button type="submit" className="btn">Plan trip</button>
          </div>
        )}
      </div>
    </form>
  );
}
