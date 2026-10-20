import { useEffect, useRef, useState } from "react";
import { labelMonth, today } from "../../data/dates";
import { formatMinor } from "../../data/money";
import { loadWorld } from "../../data/world";
import { yearReport, type YearReport } from "../../data/ytd";
import { BigAmount } from "../../ui/Amount";
import { categoryTone } from "../../ui/categoryColor";
import { Empty } from "../../ui/Empty";
import { DashboardIcon, NextIcon, PrevIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { Popover, usePopover } from "../../ui/Popover";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: string) => `${SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}`;
const signed = (n: number, base: string) => (n < 0 ? "−" : n > 0 ? "+" : "") + formatMinor(Math.abs(n), base);

/** One year at a glance: spent, income and net, month by month, and where the money went. Read-only. */
export function YearView() {
  const { store, rev } = useLedger();
  const thisYear = Number(today().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<{ r: YearReport; base: string }>();
  const pop = usePopover<number>();
  const chartRef = useRef<HTMLDivElement>(null);
  const { close } = pop;
  useEffect(() => close(), [data, close]);

  useEffect(() => {
    let stale = false; // a slower load for a year already left must not overwrite a newer one
    (async () => {
      const w = await loadWorld(store);
      const r = yearReport({ entries: w.entries, rules: w.rules, base: w.base, year, today: today() });
      if (!stale) setData({ r, base: w.base });
    })();
    return () => { stale = true; };
  }, [store, rev, year]);

  const picker = (
    <div className="toolrow">
      <span className="nav">
        <button aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><PrevIcon /></button>
        <button className="title" title="Go to this year" onClick={() => setYear(thisYear)}>{year}</button>
        <button aria-label="Next year" onClick={() => setYear((y) => y + 1)}><NextIcon /></button>
      </span>
    </div>
  );
  if (!data || data.r.year !== year) return <div className="cardview">{picker}</div>;
  const { r, base } = data;
  const period = r.year === thisYear ? `Jan 1 to ${dayLabel(r.to)}` : "Full year";
  const max = Math.max(...r.months.map((m) => m.spent), 1);
  const catTotal = r.categories.reduce((a, c) => a + c.amount, 0);
  const nowIdx = r.year === thisYear ? Number(today().slice(5, 7)) - 1 : -1;
  const open = pop.openKey !== undefined ? r.months[pop.openKey] : undefined;

  return (
    <div className="cardview">
      {picker}
      {r.future ? (
        <Empty icon={<DashboardIcon />} title="Nothing yet" note={`${year} has not started`} />
      ) : r.empty ? (
        <Empty icon={<DashboardIcon />} title="Nothing in this year" note={String(year)} />
      ) : (
        <>
          <div className="statrow">
            <div className="card stat hero"><div className="mute">Spent</div><BigAmount minor={r.spent} currency={base} /><div className="mute small">{period}</div></div>
            <div className="card stat"><div className="mute">Income</div><BigAmount minor={r.income} currency={base} /><div className="mute small">salary and other income</div></div>
            <div className="card stat"><div className="mute">Net</div><div className={r.net > 0 ? "big pos" : "big"}>{signed(r.net, base)}</div><div className="mute small">income minus spent</div></div>
          </div>

          <div ref={chartRef} className={pop.open ? "card pad catcard popopen" : "card pad catcard"}>
            <div className="dailyhead yearhead"><span className="mute">By month</span><span className="mute small r"><i className="yin key" aria-hidden="true" />income</span></div>
            <div className="ybars">
              {r.months.map((m, i) => (
                <button key={m.month} type="button" className={i === nowIdx ? "ybar now" : m.happened ? "ybar" : "ybar later"} aria-expanded={pop.openKey === i}
                  aria-label={`${labelMonth(m.month)}, spent ${formatMinor(m.spent, base)}, income ${formatMinor(m.income, base)}`} {...pop.trigger(i)}>
                  <span className="yfill"><i style={{ height: `${m.spent > 0 ? Math.max((m.spent / max) * 100, 2) : 0}%` }} /></span>
                  <span className="ymark">{m.income > 0 && <i className="yin" />}</span>
                  <span className="ylab">{SHORT[i]}</span>
                </button>
              ))}
            </div>
            {open && (
              <Popover open={pop.open} container={chartRef} popRef={pop.popRef} id="yearpop" label={`${labelMonth(open.month)} breakdown`}>
                <div className="pophead"><b>{labelMonth(open.month)}</b></div>
                <ul className="poplist">
                  <li><span>Spent</span><span>{formatMinor(open.spent, base)}</span></li>
                  <li><span>Income</span><span>{formatMinor(open.income, base)}</span></li>
                  <li><span>Net</span><span>{signed(open.income - open.spent, base)}</span></li>
                </ul>
              </Popover>
            )}
          </div>

          <div className="grid g2">
            <div className="card pad yearcats">
              <div className="mute">Categories</div>
              {r.categories.length === 0 ? <p className="mute small">Nothing spent</p> : r.categories.map((c) => (
                <div key={c.category} className="row static">
                  <span><i className={`dot tone-${categoryTone(c.category)}`} aria-hidden="true" />{c.category}</span>
                  <span>{formatMinor(c.amount, base)} <span className="mute small">{catTotal > 0 ? Math.round((c.amount / catTotal) * 100) : 0}%</span></span>
                </div>
              ))}
            </div>
            <div className="card pad">
              <div className="mute">Months</div>
              <div className="row static"><span>Average a month</span><span>{formatMinor(r.average, base)}</span></div>
              {r.highest && <div className="row static"><span>Highest</span><span>{formatMinor(r.highest.amount, base)} <span className="mute">{SHORT[Number(r.highest.month.slice(5, 7)) - 1]}</span></span></div>}
              {r.lowest && <div className="row static"><span>Lowest</span><span>{formatMinor(r.lowest.amount, base)} <span className="mute">{SHORT[Number(r.lowest.month.slice(5, 7)) - 1]}</span></span></div>}
              {r.lastYear && (
                <div className="row static"><span>vs same period {r.year - 1}</span>
                  <span>{r.lastYear.change === 0 ? "Same" : `${Math.abs(r.lastYear.change ?? 0)}% ${(r.lastYear.change ?? 0) < 0 ? "less" : "more"}`} <span className="mute small">{formatMinor(r.lastYear.spent, base)}</span></span></div>
              )}
              {!r.lastYear && <div className="row static"><span>vs same period {r.year - 1}</span><span className="mute">No earlier data</span></div>}
            </div>
          </div>
          {r.unconverted > 0 && <p className="mute small">{r.unconverted} foreign {r.unconverted === 1 ? "amount has" : "amounts have"} no rate and {r.unconverted === 1 ? "is" : "are"} left out.</p>}
          <p className="mute small">Spent is your share of splits, less refunds. Card payments, transfers and settling up are not spending or income.</p>
        </>
      )}
    </div>
  );
}
