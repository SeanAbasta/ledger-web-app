import { useEffect, useState } from "react";
import { toBase } from "../../data/base";
import { getSettings, list } from "../../data/collections";
import { addDays, addMonths, labelMonth, monthEnd, monthStart, today } from "../../data/dates";
import { loadEntries } from "../../data/months";
import { formatMinor } from "../../data/money";
import { ledgerItems, occurrences } from "../../data/rules";
import { myShare } from "../../data/splits";
import { pctChange, summarize, topCategories, type Summary } from "../../data/summary";
import { useLedger } from "../../ui/Ledger";

interface View {
  base: string;
  cur: Summary;
  prevTotal: number;
  stillDue: number;
  from: string;
  isCurrent: boolean;
}

const C = 2 * Math.PI * 40;

function Donut({ cats, total, base }: { cats: Summary["byCategory"]; total: number; base: string }) {
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label={`Spending by category, total ${formatMinor(total, base)}`}>
      <g fill="none" strokeWidth="18" transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r="40" className="track" />
        {cats.map((c, i) => {
          const len = (c.amount / total) * C;
          const el = <circle key={c.category} cx="60" cy="60" r="40" className={`s${i}`} strokeDasharray={`${Math.max(len - 1, 0)} ${C - Math.max(len - 1, 0)}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </g>
    </svg>
  );
}

function Bars({ days, from, todayIdx, base }: { days: number[]; from: string; todayIdx: number; base: string }) {
  const max = Math.max(...days, 1);
  return (
    <svg viewBox={`0 0 ${days.length * 10} 100`} width="100%" height="150" preserveAspectRatio="none" role="img" aria-label={`Daily spending from ${from}, highest ${formatMinor(max, base)}`}>
      {days.map((v, i) => {
        const h = (v / max) * 96;
        return <rect key={i} x={i * 10 + 1.5} y={100 - h} width="7" height={Math.max(h, v ? 1 : 0)} rx="2" className={i === todayIdx ? "bar now" : "bar"}><title>{`${i + 1}: ${formatMinor(v, base)}`}</title></rect>;
      })}
    </svg>
  );
}

export function Dashboard() {
  const { store, rev } = useLedger();
  const [anchor, setAnchor] = useState(today());
  const [v, setV] = useState<View>();

  useEffect(() => {
    (async () => {
      const t = today();
      const base = (await getSettings(store)).baseCurrency;
      const rules = await list(store, "rules");
      const from = monthStart(anchor);
      const to = monthEnd(anchor);
      const isCurrent = from === monthStart(t);
      const spentTo = to < t ? to : t; // only what has happened
      const prevFrom = addMonths(from, -1);
      const prevTo = isCurrent ? addMonths(spentTo, -1) : monthEnd(prevFrom);
      const entries = await loadEntries(store, prevFrom, to);
      const cur = summarize(from > t ? [] : ledgerItems(entries, rules, from, spentTo), base, from, to);
      const prev = summarize(ledgerItems(entries, rules, prevFrom, prevTo), base, prevFrom, prevTo);
      const stillDue = isCurrent
        ? rules.flatMap((r) => occurrences(r, addDays(t, 1), to)).filter((o) => o.kind === "expense")
            .reduce((a, o) => a + (toBase({ amount: myShare(o.amount, o.split), currency: o.currency }, base) ?? 0), 0)
        : 0;
      setV({ base, cur, prevTotal: prev.total, stillDue, from, isCurrent });
    })();
  }, [store, rev, anchor]);

  if (!v) return null;
  const { base, cur, prevTotal, stillDue, from, isCurrent } = v;
  const cats = topCategories(cur.byCategory);
  const change = pctChange(cur.total, prevTotal);
  const todayIdx = isCurrent ? Number(today().slice(8)) - 1 : -1;

  return (
    <>
      <div className="toolrow">
        <span className="nav">
          <button aria-label="Previous month" onClick={() => setAnchor(addMonths(from, -1))}>‹</button>
          <span>{labelMonth(from)}</span>
          <button aria-label="Next month" onClick={() => setAnchor(addMonths(from, 1))}>›</button>
        </span>
      </div>

      <div className="grid g3">
        <div className="card stat"><div className="mute">Spent</div><div className="big">{formatMinor(cur.total, base)}</div>
          <div className="mute small">{change === null ? "No earlier data" : change === 0 ? "Same as last month" : `${Math.abs(change)}% ${change < 0 ? "less" : "more"} than last month`}</div></div>
        <div className="card stat"><div className="mute">Still due</div><div className="big">{formatMinor(stillDue, base)}</div>
          <div className="mute small">{isCurrent ? "rest of this month" : "current month only"}</div></div>
        <div className="card stat"><div className="mute">Last month</div><div className="big">{formatMinor(prevTotal, base)}</div>
          <div className="mute small">{isCurrent ? "same days" : "full month"}</div></div>
      </div>

      {cur.total === 0 ? (
        <p className="mute empty">Nothing spent yet</p>
      ) : (
        <div className="grid g2">
          <div className="card pad">
            <div className="mute">Categories</div>
            <div className="donut"><Donut cats={cats} total={cur.total} base={base} /></div>
            <ul className="legend">
              {cats.map((c, i) => (
                <li key={c.category}><i className={`k${i}`} />{c.category}<span className="r">{Math.round((c.amount / cur.total) * 100)}%</span></li>
              ))}
            </ul>
          </div>
          <div className="card pad">
            <div className="mute">Daily</div>
            <Bars days={cur.byDay} from={from} todayIdx={todayIdx} base={base} />
          </div>
        </div>
      )}
      {cur.unconverted > 0 && <p className="mute small">{cur.unconverted} foreign {cur.unconverted === 1 ? "amount has" : "amounts have"} no rate and {cur.unconverted === 1 ? "is" : "are"} left out.</p>}
    </>
  );
}
