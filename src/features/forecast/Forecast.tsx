import { useEffect, useState } from "react";
import { accountBalances } from "../../data/accounts";
import { owedSummary, type OwedSummary } from "../../data/balances";
import { addMonths, labelMonth, monthStart, today } from "../../data/dates";
import { startAccount } from "../../data/defaults";
import { forecast, type Forecast as F } from "../../data/forecast";
import { activeSalaryRule, salaryFor, setRepeat, setSalary } from "../../data/income";
import { formatMinor, parseMinor } from "../../data/money";
import { itemsToDate, loadWorld, type World } from "../../data/world";
import { isCard } from "../../data/schema";
import { useLedger } from "../../ui/Ledger";
import { loadLastUsed, rememberUsed } from "../../ui/lastUsed";
import { MoneyInput } from "../../ui/MoneyInput";

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

/** A month's salary box: shows commas while typing, saves when you leave the field or press Enter. */
function SalaryField({ initial, currency, onCommit }: { initial: string; currency: string; onCommit: (plain: string) => void }) {
  const [v, setV] = useState(initial);
  return <MoneyInput placeholder="Add" currency={currency} value={v} onChange={setV} onBlur={() => onCommit(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

export function Forecast() {
  const { store, rev, changed } = useLedger();
  const [w, setW] = useState<World>();
  const [start, setStart] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [owed, setOwed] = useState<OwedSummary>();
  const [f, setF] = useState<F>();
  const [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    (async () => {
      const world = await loadWorld(store);
      const t = today();
      const upToToday = itemsToDate(world, t);
      const b = accountBalances(world.accounts, upToToday, world.base);
      const o = owedSummary(world.people, upToToday, world.base);
      setOwed(o);
      setW(world);
      setStart(b.totalBase);
      setSkipped(b.skipped);
      const banks = world.accounts.filter((a) => !isCard(a));
      // Keep a choice made here; otherwise start with the default (or last used) income account, else the first bank.
      setAccountId((x) => (banks.some((b) => b.id === x) ? x : startAccount("income", world.settings.defaults, loadLastUsed(), banks) || banks[0]?.id || ""));
      setF(forecast({ start: b.totalBase, today: t, base: world.base, entries: world.entries, rules: world.rules, owed: o.net, accounts: world.accounts }));
    })();
  }, [store, rev]);

  if (!w || !f) return null;
  const { base } = w;
  const t = today();
  const repeat = !!activeSalaryRule(w.rules, t);
  const banks = w.accounts.filter((a) => !isCard(a)); // salary never goes to a card

  async function commit(month: string, text: string) {
    setError("");
    const cur = salaryFor(month, w!.entries, w!.rules)?.amount ?? null;
    const val = text.trim() === "" ? null : parseMinor(text, base);
    if (text.trim() !== "" && val === null) return setError("Enter a valid amount");
    if (val === cur) return;
    await setSalary(store, month, val, { base, accountId: accountId || banks[0]?.id });
    rememberUsed({ income: accountId });
    changed();
  }

  async function toggle(on: boolean) {
    setError("");
    try {
      await setRepeat(store, on, { today: t, base, accountId: accountId || banks[0]?.id });
      rememberUsed({ income: accountId });
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change");
    }
  }

  return (
    <>
      <div className={`grid ${owed?.net ? "g3" : "g2"}`}>
        <div className="card stat"><div className="mute">Balance today</div><div className="big">{formatMinor(start, base)}</div>
          <div className="mute small">{!w.accounts.length ? "add accounts in Settings" : w.accounts.some(isCard) ? "bank accounts, cards not included" : "all accounts"}{skipped ? ` · ${skipped} left out (no rate)` : ""}</div></div>
        {!!owed?.net && (
          <div className="card stat"><div className="mute">{owed.net > 0 ? "Owed to you" : "You owe"}</div><div className="big">{formatMinor(Math.abs(owed.net), base)}</div>
            <div className="mute small">net, {owed.net > 0 ? "expected back" : "to pay"} this month</div></div>
        )}
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
              <SalaryField currency={base} initial={s ? formatMinor(s.amount, base).replace(/[^\d.]/g, "") : ""} onCommit={(text) => void commit(m, text)} />
            </label>
          );
        })}
        <div className="field"><b>Repeat every month</b>
          <button type="button" className={`toggle ${repeat ? "on" : ""}`} aria-pressed={repeat} onClick={() => void toggle(!repeat)}><i /></button></div>
        {banks.length > 0 && (
          <label className="field"><b>Paid into</b>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
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
            <span>
              {m.noIncome ? <span className="tag warn">No income set</span> : formatMinor(m.income, base)}
              {m.owed !== 0 && <span className="mute small owedline">{m.owed > 0 ? "+" : "-"} {formatMinor(Math.abs(m.owed), base)} {m.owed > 0 ? "owed to you" : "you owe"}</span>}
            </span>
            <span>{formatMinor(m.obligations + m.variable + m.cards, base)}{m.cards !== 0 && <span className="mute small owedline">{formatMinor(m.cards, base)} card bills</span>}</span>
            <span><b>{formatMinor(m.end, base)}</b></span>
          </div>
        ))}
      </div>
      <p className="mute small">Assumes people settle what they owe you this month, and everyday spending repeats your recent average.</p>
    </>
  );
}
