import { useEffect, useState } from "react";
import { accountBalances, type Balances } from "../../data/accounts";
import { owedSummary, type OwedSummary } from "../../data/balances";
import { toBase } from "../../data/base";
import { cardStatus, type CardStatus } from "../../data/cards";
import { activeSalaryRule } from "../../data/income";
import { isCard, type Account, type Defaults } from "../../data/schema";
import { forecast } from "../../data/forecast";
import { itemsToDate, loadWorld } from "../../data/world";
import { getSettings, list } from "../../data/collections";
import { addDays, addMonths, labelMonth, monthEnd, monthStart, today } from "../../data/dates";
import { loadEntries } from "../../data/months";
import { formatMinor } from "../../data/money";
import { ledgerItems, occurrences } from "../../data/rules";
import { myShare } from "../../data/splits";
import { pctChange, summarize, topCategories, type Summary } from "../../data/summary";
import { useLedger } from "../../ui/Ledger";
import { useTodayKey } from "../../ui/useTodayKey";
import { CardTile } from "./CardTile";

interface View {
  base: string;
  cur: Summary;
  prevTotal: number;
  stillDue: number;
  from: string;
  isCurrent: boolean;
  balances: Balances;
  owed: OwedSummary;
  next?: { month: string; end: number };
  cards: { card: Account; st: CardStatus }[];
  banks: Account[];
  salaryAccount?: string;
  defaults?: Defaults;
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
        return <rect key={i} x={i * 10 + 1.5} y={100 - h} width="7" height={Math.max(h, v > 0 ? 1 : 0)} rx="2" className={i === todayIdx ? "bar now" : "bar"}><title>{`${i + 1}: ${formatMinor(v, base)}`}</title></rect>;
      })}
    </svg>
  );
}

export function Dashboard({ onOpenPerson }: { onOpenPerson: (personId: string) => void }) {
  const { store, rev } = useLedger();
  const [anchor, setAnchor] = useState(today());
  const [v, setV] = useState<View>();
  const goToday = () => setAnchor(today());
  useTodayKey(goToday);

  useEffect(() => {
    (async () => {
      const t = today();
      const settings = await getSettings(store);
      const base = settings.baseCurrency;
      const rules = await list(store, "rules");
      const from = monthStart(anchor);
      const to = monthEnd(anchor);
      const isCurrent = from === monthStart(t);
      const spentTo = to < t ? to : t; // only what has happened
      const prevFrom = addMonths(from, -1);
      const prevTo = isCurrent ? addMonths(spentTo, -1) : monthEnd(prevFrom);
      const entries = await loadEntries(store, prevFrom, to);
      const world = await loadWorld(store);
      const cur = summarize(from > t ? [] : ledgerItems(entries, rules, from, spentTo), base, from, to, world.entries);
      const prev = summarize(ledgerItems(entries, rules, prevFrom, prevTo), base, prevFrom, prevTo, world.entries);
      const stillDue = isCurrent
        ? rules.flatMap((r) => occurrences(r, addDays(t, 1), to)).filter((o) => o.kind === "expense")
            .reduce((a, o) => a + (toBase({ amount: myShare(o.amount, o.split), currency: o.currency }, base) ?? 0), 0)
        : 0;
      const upToToday = itemsToDate(world, t);
      const balances = accountBalances(world.accounts, upToToday, base);
      const owed = owedSummary(world.people, upToToday, base);
      const fc = forecast({ start: balances.totalBase, today: t, base, entries: world.entries, rules: world.rules, months: 2, owed: owed.net, accounts: world.accounts });
      const cards = world.accounts.filter(isCard).map((card) => ({ card, st: cardStatus(card, upToToday, world.rules, t) }));
      const banks = world.accounts.filter((a) => !isCard(a));
      setV({ base, cur, prevTotal: prev.total, stillDue, from, isCurrent, balances, owed, next: fc.months[1], cards, banks, salaryAccount: activeSalaryRule(world.rules, t)?.accountId, defaults: settings.defaults });
    })();
  }, [store, rev, anchor]);

  if (!v) return null;
  const { base, cur, prevTotal, stillDue, from, isCurrent, balances, owed, next, cards, banks, salaryAccount, defaults } = v;
  const showAccounts = balances.accounts.length > 0 || balances.unassigned !== 0;
  const showOwed = owed.people.length > 0;
  const bottomCards = [showAccounts, showOwed, !!next].filter(Boolean).length;
  const cats = topCategories(cur.byCategory);
  // Shares of what was spent per category. A refund for an earlier month's purchase can leave a
  // category below zero; it is left out of the chart, so shares use the categories shown.
  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  const change = pctChange(cur.total, prevTotal);
  const todayIdx = isCurrent ? Number(today().slice(8)) - 1 : -1;

  return (
    <>
      <div className="toolrow">
        <span className="nav">
          <button aria-label="Previous month" onClick={() => setAnchor(addMonths(from, -1))}>‹</button>
          <button className="title" title="Go to this month" onClick={goToday}>{labelMonth(from)}</button>
          <button aria-label="Next month" onClick={() => setAnchor(addMonths(from, 1))}>›</button>
          <button className={monthStart(anchor) === monthStart(today()) ? "today off" : "today"} onClick={goToday}>Today</button>
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

      {catTotal <= 0 ? (
        <p className="mute empty">Nothing spent yet</p>
      ) : (
        <div className="grid g2">
          <div className="card pad">
            <div className="mute">Categories</div>
            <div className="donut"><Donut cats={cats} total={catTotal} base={base} /></div>
            <ul className="legend">
              {cats.map((c, i) => (
                <li key={c.category}><i className={`k${i}`} />{c.category}<span className="r">{Math.round((c.amount / catTotal) * 100)}%</span></li>
              ))}
            </ul>
          </div>
          <div className="card pad">
            <div className="mute">Daily</div>
            <Bars days={cur.byDay} from={from} todayIdx={todayIdx} base={base} />
          </div>
        </div>
      )}
      {cards.length > 0 && (
        <div className={`grid ${cards.length % 3 === 0 ? "g3" : "g2"}`}>
          {cards.map(({ card, st }) => <CardTile key={card.id} card={card} st={st} banks={banks} defaultBank={salaryAccount} defaults={defaults} />)}
        </div>
      )}
      <div className={`grid ${bottomCards === 3 ? "g3" : "g2"}`}>
        {showAccounts && (
          <div className="card pad">
            <div className="mute">Accounts</div>
            {balances.accounts.map(({ account, balance }) => (
              <div key={account.id} className="row static"><span>{account.name}</span><span>{formatMinor(balance, account.currency)}</span></div>
            ))}
            {balances.unassigned !== 0 && <div className="row static"><span className="mute">Other</span><span>{formatMinor(balances.unassigned, base)}</span></div>}
            <div className="row static"><b>Total</b><b>{formatMinor(balances.totalBase, base)}</b></div>
          </div>
        )}
        {showOwed && (
          <div className="card pad">
            <div className="mute">{owed.net >= 0 ? "Owed to you" : "You owe"}</div>
            <div className="big">{formatMinor(Math.abs(owed.net), base)}</div>
            <div className="mute small">
              {owed.owedToMe && owed.iOwe ? `${formatMinor(owed.owedToMe, base)} owed to you, ${formatMinor(owed.iOwe, base)} you owe` : "net"}
            </div>
            {owed.people.map((p) => (
              <button key={p.person.id} className="row" title={`Open ${p.person.name} in Splits`} onClick={() => onOpenPerson(p.person.id)}>
                <span>
                  {p.person.name} <span className="mute">{p.base >= 0 ? "owes you" : "you owe"}</span>
                  {p.foreign && Object.keys(p.byCurrency).filter((c) => c !== base).map((c) => <span key={c} className="tag">{c}</span>)}
                </span>
                <span className={p.base > 0 ? "pos" : ""}>{formatMinor(Math.abs(p.base), base)}</span>
              </button>
            ))}
            {owed.skipped > 0 && <p className="mute small">{owed.skipped} foreign {owed.skipped === 1 ? "balance has" : "balances have"} no rate and {owed.skipped === 1 ? "is" : "are"} left out.</p>}
          </div>
        )}
        {next && (
          <div className="card stat"><div className="mute">End of {labelMonth(next.month)}</div><div className="big">{formatMinor(next.end, base)}</div><div className="mute small">{owed.net ? "forecast, after everyone settles up" : "forecast"}</div></div>
        )}
      </div>
      {cur.unconverted > 0 && <p className="mute small">{cur.unconverted} foreign {cur.unconverted === 1 ? "amount has" : "amounts have"} no rate and {cur.unconverted === 1 ? "is" : "are"} left out.</p>}
    </>
  );
}
