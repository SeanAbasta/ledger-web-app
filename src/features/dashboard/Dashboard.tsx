import { useEffect, useRef, useState } from "react";
import { accountBalances, type Balances } from "../../data/accounts";
import { owedSummary, type OwedSummary } from "../../data/balances";
import { toBase } from "../../data/base";
import { cardBreakdown, cardStatus, type CardBreakdown, type CardStatus } from "../../data/cards";
import { activeSalaryRule } from "../../data/income";
import { isCard, type Account, type Defaults } from "../../data/schema";
import { forecast } from "../../data/forecast";
import { itemsToDate, loadWorld } from "../../data/world";
import { getSettings, list, listAll } from "../../data/collections";
import { addDays, addMonths, labelMonth, labelShort, monthEnd, monthStart, today } from "../../data/dates";
import { loadEntries } from "../../data/months";
import { formatMinor } from "../../data/money";
import { ledgerItems, occurrences, type LedgerItem } from "../../data/rules";
import { myShare } from "../../data/splits";
import { accountsWhatIf, dailyStats, matchesAccount, NO_ACCOUNT, pctChange, summarize, topCategories, type AccountFilter, type Summary } from "../../data/summary";
import { orphans, type Orphans } from "../../data/usage";
import { AccountOptions } from "../../ui/AccountOptions";
import { BigAmount } from "../../ui/Amount";
import { cardColor } from "../../ui/cardColor";
import { categoryTone } from "../../ui/categoryColor";
import { Empty } from "../../ui/Empty";
import { Popover, usePopover } from "../../ui/Popover";
import { DashboardIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { useTodayKey } from "../../ui/useTodayKey";
import { CardTile } from "./CardTile";
import { CardView } from "./CardView";
import { FixSheet } from "./FixSheet";
import { RecurringView } from "./RecurringView";

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
  cards: { card: Account; st: CardStatus; bd: CardBreakdown }[];
  banks: Account[];
  accounts: Account[];
  /** Everything up to today, for Reconcile. */
  items: LedgerItem[];
  salaryAccount?: string;
  defaults?: Defaults;
  /** Entries and plans on removed accounts (they count as "Other"), and every account, removed ones included. */
  orphans: Orphans;
  allAccounts: Account[];
  /** Which way the month changed (1 = next), so the cards slide in from that side; 0 = no slide. */
  dir: -1 | 0 | 1;
  /** The spending filter these numbers were worked out with ("" is all accounts). */
  acct: string;
}

const C = 2 * Math.PI * 40;

function Donut({ cats, total, base, trigger }: { cats: Summary["byCategory"]; total: number; base: string; trigger: ReturnType<typeof usePopover<string>>["trigger"] }) {
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label={`Spending by category, total ${formatMinor(total, base)}`}>
      <g fill="none" strokeWidth="18" transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r="40" className="track" />
        {cats.map((c) => {
          const len = (c.amount / total) * C;
          // Hover or tap a segment for its breakdown; keyboard users get the same from the legend buttons.
          const el = <circle key={c.category} cx="60" cy="60" r="40" className={`seg tone-${categoryTone(c.category)}`} strokeDasharray={`${Math.max(len - 1, 0)} ${C - Math.max(len - 1, 0)}`} strokeDashoffset={-acc} {...trigger(c.category)} />;
          acc += len;
          return el;
        })}
      </g>
    </svg>
  );
}

/** One column per day, today's at full strength. HTML columns keep the rounded tops round at any width
 *  (a stretched SVG squashed them). Heights go through React's style prop, which the CSP allows.
 *  Days that have happened with nothing spent get a short stub, so a quiet day reads as a day and not a gap. */
function Bars({ days, from, elapsed, todayIdx, base, label }: { days: number[]; from: string; elapsed: number; todayIdx: number; base: string; label: string }) {
  const max = Math.max(...days, 1);
  return (
    <div className="dbars" role="img" aria-label={label}>
      {days.map((v, i) => {
        const quiet = i < elapsed && v <= 0;
        // Weekly labels (1, 8, 15, ...), and today's own; a weekly one right next to today's is dropped.
        const named = i === todayIdx || (i % 7 === 0 && Math.abs(i - todayIdx) > 1);
        return (
          <span key={i} className={i === todayIdx ? "dbar now" : "dbar"} title={`${labelShort(addDays(from, i))}: ${formatMinor(v, base)}`}>
            <span className="dfill"><i className={quiet ? "zero" : undefined} style={quiet ? undefined : { height: `${v > 0 ? Math.max((v / max) * 100, 2) : 0}%` }} /></span>
            <span className="dlab">{named ? i + 1 : ""}</span>
          </span>
        );
      })}
    </div>
  );
}

export function Dashboard({ onOpenPerson, onOpenLedger, onOpenCardSettings }: { onOpenPerson: (personId: string) => void; onOpenLedger: (date: string) => void; onOpenCardSettings: (cardId: string) => void }) {
  const { store, rev } = useLedger();
  const [anchor, setAnchor] = useState(today());
  const [v, setV] = useState<View>();
  // A card opened from its tile: the per-card statement view replaces the Dashboard until Back.
  const [openCard, setOpenCard] = useState<string>();
  const [fixing, setFixing] = useState(false);
  // A Dashboard sub-view (like the card view): the Recurring list.
  const [sub, setSub] = useState<"recurring">();
  // Spending filter: "" is all accounts, an account id, or NO_ACCOUNT. Balances are never filtered.
  const [acct, setAcct] = useState("");
  const pop = usePopover<string>();
  const catRef = useRef<HTMLDivElement>(null);
  const { close } = pop;
  // New numbers (another month, filter or a sync) close an open breakdown.
  useEffect(() => close(), [v, close]);
  const dir = useRef<-1 | 0 | 1>(0);
  const go = (d: -1 | 0 | 1, next: (a: string) => string) => { dir.current = d; setAnchor(next); };
  const goToday = () => { const t = today(); go(monthStart(t) === monthStart(anchor) ? 0 : t > anchor ? 1 : -1, () => t); };
  useTodayKey(goToday);

  useEffect(() => {
    let stale = false; // a slower load for a month already left must not overwrite a newer one
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
      // This month, last month and Still due all use the same filter, so the comparison is like for like.
      const filter: AccountFilter | undefined = acct ? { account: acct, live: world.accounts.map((a) => a.id) } : undefined;
      const cur = summarize(from > t ? [] : ledgerItems(entries, rules, from, spentTo), base, from, to, world.entries, filter);
      const prev = summarize(ledgerItems(entries, rules, prevFrom, prevTo), base, prevFrom, prevTo, world.entries, filter);
      const stillDue = isCurrent
        ? rules.flatMap((r) => occurrences(r, addDays(t, 1), to)).filter((o) => o.kind === "expense" && matchesAccount({ type: "occurrence", date: o.date, occ: o }, filter))
            .reduce((a, o) => a + (toBase({ amount: myShare(o.amount, o.split), currency: o.currency }, base) ?? 0), 0)
        : 0;
      const upToToday = itemsToDate(world, t);
      const balances = accountBalances(world.accounts, upToToday, base);
      const owed = owedSummary(world.people, upToToday, base);
      const fc = forecast({ start: balances.totalBase, today: t, base, entries: world.entries, rules: world.rules, months: 2, owed: owed.net, accounts: world.accounts });
      const cards = world.accounts.filter(isCard).map((card) => ({ card, st: cardStatus(card, upToToday, world.rules, t), bd: cardBreakdown(card, upToToday, t) }));
      const banks = world.accounts.filter((a) => !isCard(a));
      const allAccounts = await listAll(store, "accounts");
      if (stale) return;
      const d = dir.current;
      dir.current = 0;
      setV((old) => ({ dir: old && old.from !== from ? d : 0, acct, base, cur, prevTotal: prev.total, stillDue, from, isCurrent, balances, owed, next: fc.months[1], cards, banks, accounts: world.accounts, items: upToToday, salaryAccount: activeSalaryRule(world.rules, t)?.accountId, defaults: settings.defaults, orphans: orphans(world.entries, world.rules, allAccounts), allAccounts }));
    })();
    return () => { stale = true; };
  }, [store, rev, anchor, acct]);

  if (!v) return null;
  const { base, cur, prevTotal, stillDue, from, isCurrent, balances, owed, next, cards, banks, accounts, items, salaryAccount, defaults } = v;
  const fixable = v.orphans.entries.length + v.orphans.rules.length > 0;
  const showAccounts = balances.accounts.length > 0 || balances.unassigned !== 0 || fixable;
  const showOwed = owed.people.length > 0;
  const whatIf = accountsWhatIf(balances.totalBase, owed.net, cards.map((c) => c.st));
  const bottomCards = [showAccounts, showOwed, !!next].filter(Boolean).length;
  const cats = topCategories(cur.byCategory);
  // Shares of what was spent per category. A refund for an earlier month's purchase can leave a
  // category below zero; it is left out of the chart, so shares use the categories shown.
  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  const change = pctChange(cur.total, prevTotal);
  const todayIdx = isCurrent ? Number(today().slice(8)) - 1 : -1;
  // Days of this month that have happened: up to today, all of a past month, none of a future one.
  const elapsed = isCurrent ? todayIdx + 1 : from > today() ? 0 : cur.byDay.length;
  const daily = dailyStats(cur.byDay, elapsed);
  const dailyLabel = `Daily spending from ${labelShort(from)}, average ${formatMinor(daily.average, base)} a day${daily.peak ? `, highest ${formatMinor(daily.peak.amount, base)} on ${labelShort(addDays(from, daily.peak.index))}` : ""}`;
  const opened = cards.find((c) => c.card.id === openCard);
  // Named from the loaded numbers' filter, so the tag never sits over the previous filter's figures while loading.
  const acctName = v.acct === NO_ACCOUNT ? "No account or removed" : accounts.find((a) => a.id === v.acct)?.name;

  // Going back never slides the month in again.
  const back = () => { setV({ ...v, dir: 0 }); setOpenCard(undefined); setSub(undefined); };

  if (sub === "recurring") {
    return (
      <>
        <div className="toolrow">
          <span className="nav"><button className="title" onClick={back}>‹ Dashboard</button></span>
        </div>
        <RecurringView />
      </>
    );
  }

  if (opened) {
    return (
      <>
        <div className="toolrow">
          <span className="nav"><button className="title" onClick={back}>‹ Dashboard</button></span>
        </div>
        <CardView card={opened.card} st={opened.st} bd={opened.bd} banks={banks} items={items} accounts={accounts} onOpenLedger={onOpenLedger} onOpenCard={() => onOpenCardSettings(opened.card.id)} />
      </>
    );
  }

  return (
    <>
      <div className="toolrow">
        <span className="nav">
          <button aria-label="Previous month" onClick={() => go(-1, (a) => addMonths(monthStart(a), -1))}>‹</button>
          <button className="title" title="Go to this month" onClick={goToday}>{labelMonth(anchor)}</button>
          <button aria-label="Next month" onClick={() => go(1, (a) => addMonths(monthStart(a), 1))}>›</button>
          <button className={monthStart(anchor) === monthStart(today()) ? "today off" : "today"} onClick={goToday}>Today</button>
        </span>
        <span className="subviews">
          <button className="btn ghost sm" onClick={() => setSub("recurring")}>Recurring</button>
        </span>
        {accounts.length > 0 && (
          <select className="acctpick" aria-label="Spending from" value={acct} onChange={(e) => setAcct(e.target.value)}>
            <option value="">All accounts</option>
            <AccountOptions accounts={accounts} />
            <option value={NO_ACCOUNT}>No account or removed</option>
          </select>
        )}
      </div>

      {/* Keyed on the loaded month: the cards swap and slide in only once the new month's numbers are ready. */}
      <div key={from} className={v.dir === 1 ? "period next" : v.dir === -1 ? "period prev" : "period"}>
      {/* Spent leads; Still due and Last month sit side by side under it on phones, beside it on computers. */}
      <div className="statrow">
        <div className="card stat hero"><div className="mute">Spent{acctName && <span className="tag">{acctName}</span>}</div><BigAmount minor={cur.total} currency={base} />
          {prevTotal > 0 && (
            // This month so far against last month's same days: full and orange once past it.
            <div className={cur.total > prevTotal ? "spentbar over" : "spentbar"} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, cur.total / prevTotal)) * 100}%` }} /></div>
          )}
          <div className="mute small">{change === null ? "No earlier data" : change === 0 ? "Same as last month" : `${Math.abs(change)}% ${change < 0 ? "less" : "more"} than last month`}</div></div>
        <div className="card stat"><div className="mute">Still due</div><BigAmount minor={stillDue} currency={base} />
          <div className="mute small">{isCurrent ? "rest of this month" : "current month only"}</div></div>
        <div className="card stat"><div className="mute">Last month</div>
          {/* Nothing to compare (same rule as Spent's "No earlier data"): say so instead of ₱0.00. */}
          {prevTotal > 0 ? <BigAmount minor={prevTotal} currency={base} /> : <BigAmount currency={base} word="No data" className="nodata" />}
          <div className="mute small">{isCurrent ? "same days" : "full month"}</div></div>
      </div>

      {catTotal <= 0 ? (
        <Empty icon={<DashboardIcon />} title="Nothing spent yet" note={acctName ? `${labelMonth(from)}, ${acctName}` : labelMonth(from)} />
      ) : (
        <div className="grid g2">
          <div ref={catRef} className={pop.open ? "card pad catcard popopen" : "card pad catcard"}>
            <div className="mute">Categories</div>
            <div className="donut"><Donut cats={cats} total={catTotal} base={base} trigger={pop.trigger} /></div>
            <ul className="legend">
              {cats.map((c) => (
                <li key={c.category}>
                  <button type="button" aria-expanded={pop.openKey === c.category} aria-controls={pop.openKey === c.category ? "catpop" : undefined} {...pop.trigger(c.category)}>
                    <i className={`tone-${categoryTone(c.category)}`} />{c.category}<span className="r">{Math.round((c.amount / catTotal) * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
            {(() => {
              const c = cats.find((x) => x.category === pop.openKey);
              if (!c) return null;
              return (
                <Popover open={pop.open} container={catRef} popRef={pop.popRef} id="catpop" label={`${c.category} breakdown`}>
                  <div className="pophead"><i className={`tone-${categoryTone(c.category)}`} /><b>{c.category}</b></div>
                  <div className="popamt"><b>{formatMinor(c.amount, base)}</b><span className="mute">{Math.round((c.amount / catTotal) * 100)}% of spending</span></div>
                  {c.members ? (
                    <ul className="poplist">
                      {c.members.map((m) => <li key={m.category}><span>{m.category}</span><span>{formatMinor(m.amount, base)}</span></li>)}
                    </ul>
                  ) : (
                    <ul className="poplist">
                      {(c.top ?? []).map((i, n) => <li key={n}><span>{i.label}<span className="mute"> {labelShort(i.date)}</span></span><span>{formatMinor(i.amount, base)}</span></li>)}
                    </ul>
                  )}
                </Popover>
              );
            })()}
          </div>
          <div className="card pad">
            <div className="dailyhead">
              <span className="mute">Daily</span>
              {elapsed > 0 && <span className="mute small">Avg {formatMinor(daily.average, base)} a day</span>}
            </div>
            <Bars days={cur.byDay} from={from} elapsed={elapsed} todayIdx={todayIdx} base={base} label={dailyLabel} />
            <div className="dailystats">
              {daily.peak && <div className="row static"><span>Highest day</span><span>{formatMinor(daily.peak.amount, base)} <span className="mute">{labelShort(addDays(from, daily.peak.index))}</span></span></div>}
              <div className="row static"><span>No spending</span><span>{daily.quietDays} of {elapsed} {elapsed === 1 ? "day" : "days"}</span></div>
            </div>
          </div>
        </div>
      )}
      {acctName && <p className="mute small hint balnote">Filtered to {acctName}. Cards, accounts and owed below show everything.</p>}
      {cards.length > 0 && (
        <div className={`grid ${cards.length % 3 === 0 ? "g3" : "g2"}`}>
          {cards.map(({ card, st }) => <CardTile key={card.id} card={card} color={cardColor(card, accounts)} st={st} banks={banks} defaultBank={salaryAccount} defaults={defaults} onOpen={() => setOpenCard(card.id)} />)}
        </div>
      )}
      <div className={`grid ${bottomCards === 3 ? "g3" : "g2"}`}>
        {showAccounts && (
          <div className="card pad">
            <div className="mute">Accounts</div>
            {balances.accounts.map(({ account, balance }) => (
              <div key={account.id} className="row static"><span>{account.name}</span><span>{formatMinor(balance, account.currency)}</span></div>
            ))}
            {(balances.unassigned !== 0 || fixable) && (
              <div className="row static"><span className="mute">Other{fixable && <button className="link" title="Move what was on removed accounts" onClick={() => setFixing(true)}>Fix</button>}</span><span>{formatMinor(balances.unassigned, base)}</span></div>
            )}
            <div className="row static"><b>Total</b><b>{formatMinor(balances.totalBase, base)}</b></div>
            {whatIf.owed && (
              <>
                <div className="row static whatif first"><span>{whatIf.owed.amount > 0 ? "+ Owed to you" : "− You owe"}</span><span className={whatIf.owed.amount > 0 ? "pos" : ""}>{formatMinor(Math.abs(whatIf.owed.amount), base)}</span></div>
                <div className="row static whatif"><span>{whatIf.owed.amount > 0 ? "If everyone pays back" : "After you pay back"}</span><span>{formatMinor(whatIf.owed.after, base)}</span></div>
              </>
            )}
            {whatIf.cards && (
              <>
                <div className="row static whatif first"><span>− Card bills</span><span>{formatMinor(whatIf.cards.amount, base)}</span></div>
                <div className="row static whatif"><span>After card bills</span><span>{formatMinor(whatIf.cards.after, base)}</span></div>
              </>
            )}
          </div>
        )}
        {showOwed && (
          <div className="card pad">
            <div className="mute">{owed.net >= 0 ? "Owed to you" : "You owe"}</div>
            <BigAmount minor={Math.abs(owed.net)} currency={base} />
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
          <div className="card stat"><div className="mute">End of {labelMonth(next.month)}</div><BigAmount minor={next.end} currency={base} /><div className="mute small">{owed.net ? "forecast, after everyone settles up" : "forecast"}</div></div>
        )}
      </div>
      {cur.unconverted > 0 && <p className="mute small">{cur.unconverted} foreign {cur.unconverted === 1 ? "amount has" : "amounts have"} no rate and {cur.unconverted === 1 ? "is" : "are"} left out.</p>}
      </div>
      {/* Outside the sliding period, so the sheet is never placed inside a moving box. */}
      {fixing && <FixSheet o={v.orphans} all={v.allAccounts} onClose={() => setFixing(false)} />}
    </>
  );
}
