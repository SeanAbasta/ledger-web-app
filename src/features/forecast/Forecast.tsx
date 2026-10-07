import { useEffect, useState } from "react";
import { accountBalances } from "../../data/accounts";
import { addMonths, labelMonth, monthStart, today } from "../../data/dates";
import { forecast, type Forecast as F } from "../../data/forecast";
import { activeSalaryRule, salaryFor, setRepeat, setSalary } from "../../data/income";
import { formatMinor, parseMinor } from "../../data/money";
import { itemsToDate, loadWorld, type World } from "../../data/world";
import { useLedger } from "../../ui/Ledger";

function Line({ values, base }: { values: number[]; base: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 400},${100 - ((v - min) / span) * 90 - 5}`);
  return (
    <svg viewBox="0 0 400 100" width="100%" height="150" preserveAspectRatio="none" role="img" aria-label={`Projected balance from ${formatMinor(values[0] ?? 0, base)} to ${formatMinor(values[values.length - 1] ?? 0, base)}`}>
      <polyline points={pts.join(" ")} fill="none" className="line" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Forecast() {
  const { store, rev, changed } = useLedger();
  const [w, setW] = useState<World>();
  const [start, setStart] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [f, setF] = useState<F>();
  const [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    (async () => {
      const world = await loadWorld(store);
      const t = today();
      const b = accountBalances(world.accounts, itemsToDate(world, t), world.base);
      setW(world);
      setStart(b.totalBase);
      setSkipped(b.skipped);
      setF(forecast({ start: b.totalBase, today: t, base: world.base, entries: world.entries, rules: world.rules }));
    })();
  }, [store, rev]);

  if (!w || !f) return null;
  const { base } = w;
  const t = today();
  const repeat = !!activeSalaryRule(w.rules, t);

  async function commit(month: string, text: string) {
    setError("");
    const cur = salaryFor(month, w!.entries, w!.rules)?.amount ?? null;
    const val = text.trim() === "" ? null : parseMinor(text, base);
    if (text.trim() !== "" && val === null) return setError("Enter a valid amount");
    if (val === cur) return;
    await setSalary(store, month, val, { base, accountId: accountId || w!.accounts[0]?.id });
    changed();
  }

  async function toggle(on: boolean) {
    setError("");
    try {
      await setRepeat(store, on, { today: t, base, accountId: accountId || w!.accounts[0]?.id });
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change");
    }
  }

  return (
    <>
      <div className="grid g2">
        <div className="card stat"><div className="mute">Balance today</div><div className="big">{formatMinor(start, base)}</div>
          <div className="mute small">{w.accounts.length ? "all accounts" : "add accounts in Settings"}{skipped ? ` · ${skipped} left out (no rate)` : ""}</div></div>
        <div className="card stat"><div className="mute">In 12 months</div><div className="big">{formatMinor(f.months[11]?.end ?? start, base)}</div>
          <div className="mute small">{f.basis ? `spending averaged over ${f.basis} ${f.basis === 1 ? "month" : "months"}` : "no spending history yet"}</div></div>
      </div>

      <div className="grp">Salary</div>
      <div className="card pad">
        {Array.from({ length: 12 }, (_, i) => addMonths(monthStart(t), i)).map((m) => {
          const s = salaryFor(m, w.entries, w.rules);
          return (
            <label key={m + (s?.amount ?? "")} className="field">
              <b>{labelMonth(m)}</b>
              <input inputMode="decimal" placeholder="Add" defaultValue={s ? formatMinor(s.amount, base).replace(/[^\d.]/g, "") : ""}
                onBlur={(e) => void commit(m, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            </label>
          );
        })}
        <div className="field"><b>Repeat every month</b>
          <button type="button" className={`toggle ${repeat ? "on" : ""}`} aria-pressed={repeat} onClick={() => void toggle(!repeat)}><i /></button></div>
        {w.accounts.length > 0 && (
          <label className="field"><b>Paid into</b>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">{w.accounts[0]!.name}</option>{w.accounts.slice(1).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        )}
        {error && <p className="err" role="alert">{error}</p>}
      </div>

      <div className="grp">Projected balance</div>
      <div className="card pad"><Line values={f.months.map((m) => m.end)} base={base} /></div>
      <div className="card ftable">
        <div className="frow head"><span>Month</span><span>Income</span><span>Spend</span><span>Balance</span></div>
        {f.months.map((m) => (
          <div key={m.month} className="frow">
            <span>{labelMonth(m.month)}</span>
            <span>{m.noIncome ? <span className="tag warn">No income set</span> : formatMinor(m.income, base)}</span>
            <span>{formatMinor(m.obligations + m.variable, base)}</span>
            <span><b>{formatMinor(m.end, base)}</b></span>
          </div>
        ))}
      </div>
      <p className="mute small">Assumes split amounts get settled and everyday spending repeats your recent average.</p>
    </>
  );
}
