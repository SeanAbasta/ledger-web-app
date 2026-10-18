import { useEffect, useRef, useState } from "react";
import { accountBalances } from "../../data/accounts";
import { owedSummary, type OwedSummary } from "../../data/balances";
import { addMonths, labelMonth, monthStart, today } from "../../data/dates";
import { startAccount } from "../../data/defaults";
import { forecast, type Forecast as F, type ForecastMonth } from "../../data/forecast";
import { activeSalaryRule, salaryFor, setRepeat, setSalary, setSalaryAccount } from "../../data/income";
import { formatMinor, parseMinor } from "../../data/money";
import { forecastStats } from "../../data/summary";
import { itemsToDate, loadWorld, type World } from "../../data/world";
import { isCard } from "../../data/schema";
import { BigAmount } from "../../ui/Amount";
import { useLedger } from "../../ui/Ledger";
import { loadLastUsed, rememberUsed } from "../../ui/lastUsed";
import { MoneyInput } from "../../ui/MoneyInput";
import { Popover, usePopover } from "../../ui/Popover";
import { Segmented } from "../../ui/Segmented";

const RANGES = ["3", "6", "12"] as const;
const RANGE_LABEL = { "3": "3 months", "6": "6 months", "12": "12 months" } as const;
const shortMonth = (m: string) => labelMonth(m).split(" ")[0]!;
/** A y-axis figure in a few characters: ₱120k, ₱1.2M. */
function compact(minor: number, base: string): string {
  const sign = formatMinor(0, base).replace(/[\d.,\s]/g, "");
  const major = Math.abs(minor) / 100;
  const n = major >= 1e6 ? `${+(major / 1e6).toFixed(1)}M` : major >= 1e3 ? `${Math.round(major / 1e3)}k` : `${Math.round(major)}`;
  return `${minor < 0 ? "-" : ""}${sign}${n}`;
}

/**
 * Projected balance: today's balance, then each month's end. The line is SVG (stretched); dots, labels,
 * below-zero tints and the tap targets are HTML placed in percent through React's style prop, so the
 * stretch never squashes them (the same reason the Dashboard daily bars are HTML).
 */
function BalanceChart({ start, months, base }: { start: number; months: ForecastMonth[]; base: string }) {
  const pop = usePopover<number>();
  const boxRef = useRef<HTMLDivElement>(null);
  const values = [start, ...months.map((m) => m.end)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo < 0) hi = Math.max(hi, 0); // below zero: keep the zero line in view
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 5 + (1 - (v - lo) / span) * 90;
  const step = 100 / (values.length - 1);
  const stats = forecastStats(start, months);
  const last = months[months.length - 1];
  const thin = months.length > 6; // every other month label on small phones
  const label = `Projected balance over ${months.length} months, from ${formatMinor(start, base)} today to ${formatMinor(last?.end ?? start, base)} at the end of ${last ? labelMonth(last.month) : "this month"}${stats.lowest ? `, lowest ${formatMinor(stats.lowest.amount, base)} in ${labelMonth(stats.lowest.month)}` : ""}`;
  const open = pop.openKey === undefined ? undefined : months[pop.openKey];
  const prevEnd = (i: number) => (i === 0 ? start : months[i - 1]!.end);
  const valueAt = (v: number, i: number, edge: "start" | "end") => (
    <span className={`fval ${edge} ${y(v) < 22 ? "below" : "above"}`} style={{ left: `${x(i)}%`, top: `${y(v)}%` }}>{formatMinor(v, base)}</span>
  );

  return (
    <div ref={boxRef} className={pop.open ? "fchart popopen" : "fchart"}>
      <div className="fgrid">
        <div className="fy" aria-hidden="true"><span>{compact(hi, base)}</span><span>{compact(lo, base)}</span></div>
        <div className="fplot">
          {months.map((m, i) => m.end < 0 && <span key={m.month} className="fband neg" style={{ left: `${Math.max(0, x(i + 1) - step / 2)}%`, width: `${Math.min(step, 100 - x(i + 1) + step / 2)}%` }} />)}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
            <line x1="0" x2="100" y1="50" y2="50" className="fmid" vectorEffect="non-scaling-stroke" />
            {lo < 0 && <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="fzero" vectorEffect="non-scaling-stroke" />}
            <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" className="line" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="fdot today" style={{ left: "0%", top: `${y(start)}%` }} aria-hidden="true" />
          {months.map((m, i) => <span key={m.month} className={m.noIncome ? "fdot noinc" : "fdot"} style={{ left: `${x(i + 1)}%`, top: `${y(m.end)}%` }} aria-hidden="true" />)}
          {valueAt(start, 0, "start")}
          {last && valueAt(last.end, months.length, "end")}
          {months.map((m, i) => (
            <button key={m.month} type="button" className="fhit" style={{ left: `${Math.max(0, x(i + 1) - step / 2)}%`, width: `${Math.min(step, 100 - x(i + 1) + step / 2)}%` }}
              aria-label={`${labelMonth(m.month)}, ${formatMinor(m.end, base)}`} aria-expanded={pop.openKey === i} aria-controls={pop.openKey === i ? "fpop" : undefined} {...pop.trigger(i)} />
          ))}
        </div>
        {/* With 12 months on a small phone only every other month is named, and "Today" (its dot and value
            say it) gives way to the current month. */}
        <div className="flabs" aria-hidden="true">
          <span className={thin ? "flab start skip" : "flab start"} style={{ left: "0%" }}>Today</span>
          {months.map((m, i) => (
            <span key={m.month} className={`flab${i === 0 ? " now" : ""}${thin && i % 2 === 1 ? " skip" : ""}${i === months.length - 1 ? " end" : ""}`} style={{ left: `${x(i + 1)}%` }}>{shortMonth(m.month)}</span>
          ))}
        </div>
      </div>
      <div className="dailystats">
        {stats.lowest && <div className="row static"><span>Lowest point</span><span>{formatMinor(stats.lowest.amount, base)} <span className="mute">{labelMonth(stats.lowest.month)}</span></span></div>}
        {stats.highest && <div className="row static"><span>Highest point</span><span>{formatMinor(stats.highest.amount, base)} <span className="mute">{labelMonth(stats.highest.month)}</span></span></div>}
        <div className="row static"><span>Change over {months.length} months</span><span className={stats.change > 0 ? "pos" : ""}>{stats.change > 0 ? "+" : stats.change < 0 ? "\u2212" : ""}{formatMinor(Math.abs(stats.change), base)}</span></div>
        {stats.below > 0 && <div className="row static"><span>Below zero</span><span className="warnink">{stats.below} {stats.below === 1 ? "month" : "months"}</span></div>}
      </div>
      {open && pop.open && (
        <Popover open={pop.open} container={boxRef} popRef={pop.popRef} id="fpop" label={`${labelMonth(open.month)} forecast`}>
          <div className="pophead"><b>{labelMonth(open.month)}</b>{open.noIncome && <span className="tag warn">No income set</span>}</div>
          <div className="popamt"><b>{formatMinor(open.end, base)}</b><span className="mute">at month end</span></div>
          <ul className="poplist">
            <li><span>Income</span><span>{formatMinor(open.income, base)}</span></li>
            <li><span>Spending</span><span>{formatMinor(open.obligations + open.variable, base)}</span></li>
            <li><span>Card bills</span><span>{formatMinor(open.cards, base)}</span></li>
            {open.owed !== 0 && <li><span>{open.owed > 0 ? "Owed back" : "You pay back"}</span><span>{formatMinor(Math.abs(open.owed), base)}</span></li>}
            <li><span>Change from {pop.openKey === 0 ? "today" : labelMonth(months[pop.openKey! - 1]!.month)}</span><span>{open.end - prevEnd(pop.openKey!) > 0 ? "+" : open.end < prevEnd(pop.openKey!) ? "\u2212" : ""}{formatMinor(Math.abs(open.end - prevEnd(pop.openKey!)), base)}</span></li>
          </ul>
        </Popover>
      )}
    </div>
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
  const [range, setRange] = useState<(typeof RANGES)[number]>("12");

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
      // The account the next salary (this month on) is paid into; with none yet, keep a choice made
      // here, else start with the default (or last used) income account, else the first bank.
      const paidInto = Array.from({ length: 12 }, (_, i) => salaryFor(addMonths(monthStart(t), i), world.entries, world.rules)?.accountId).find((id) => banks.some((b) => b.id === id));
      setAccountId((x) => paidInto ?? (banks.some((b) => b.id === x) ? x : startAccount("income", world.settings.defaults, loadLastUsed(), banks) || banks[0]?.id || ""));
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

  // Moves salary from this month on (the plan and manual entries); earlier months keep their account.
  async function pickAccount(id: string) {
    setError("");
    setAccountId(id);
    await setSalaryAccount(store, id, { today: t });
    rememberUsed({ income: id });
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
        <div className="card stat"><div className="mute">Balance today</div><BigAmount minor={start} currency={base} />
          <div className="mute small">{!w.accounts.length ? "add accounts in Settings" : w.accounts.some(isCard) ? "bank accounts, cards not included" : "all accounts"}{skipped ? ` · ${skipped} left out (no rate)` : ""}</div></div>
        {!!owed?.net && (
          <div className="card stat"><div className="mute">{owed.net > 0 ? "Owed to you" : "You owe"}</div><BigAmount minor={Math.abs(owed.net)} currency={base} />
            <div className="mute small">net, {owed.net > 0 ? "expected back" : "to pay"} this month</div></div>
        )}
        <div className="card stat"><div className="mute">In 12 months</div><BigAmount minor={f.months[11]?.end ?? start} currency={base} />
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
          <button type="button" className={`toggle ${repeat ? "on" : ""}`} aria-pressed={repeat} aria-label="Repeat salary every month" onClick={() => void toggle(!repeat)}><i /></button></div>
        {banks.length > 0 && (
          <label className="field"><b>Paid into<span className="mute small sub">This month on</span></b>
            <select value={accountId} onChange={(e) => void pickAccount(e.target.value)}>{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        )}
        {error && <p className="err" role="alert">{error}</p>}
      </div>

      <div className="grp">Projected balance</div>
      <div className="card pad">
        <div className="frange"><Segmented value={range} options={RANGES} labels={RANGE_LABEL} onChange={setRange} /></div>
        {/* Keyed on the range so an open month closes when the range changes. */}
        <BalanceChart key={range} start={start} months={f.months.slice(0, Number(range))} base={base} />
      </div>
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
