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
import { addDays, addMonths, labelMonth, labelShort, monthEnd, monthStart, today, weekday } from "../../data/dates";
import { loadEntries } from "../../data/months";
import { formatMinor } from "../../data/money";
import { ledgerItems, occurrences, type LedgerItem } from "../../data/rules";
import { myShare } from "../../data/splits";
import { accountsWhatIf, dailyStats, matchesAccount, NO_ACCOUNT, pctChange, plannedSummary, summarize, topCategories, type AccountFilter, type Summary } from "../../data/summary";
import { orphans, type Orphans } from "../../data/usage";
import { AccountOptions } from "../../ui/AccountOptions";
import { BigAmount } from "../../ui/Amount";
import { cardColor } from "../../ui/cardColor";
import { categoryTone } from "../../ui/categoryColor";
import { Empty } from "../../ui/Empty";
import { Popover, usePopover } from "../../ui/Popover";
import { Segmented } from "../../ui/Segmented";
import { DashboardIcon, NextIcon, PrevIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { useTodayKey } from "../../ui/useTodayKey";
import { balanceNote } from "./balanceNote";
import { CardTile } from "./CardTile";
import { CardView } from "./CardView";
import { FixSheet } from "./FixSheet";
import { RecurringView } from "./RecurringView";
import { YearView } from "./YearView";

interface View {
  base: string;
  cur: Summary;
  /** The category chart and daily bars: what was spent, plus the rest of the month's scheduled items when it is not over. */
  chart: Summary;
  /** The scheduled part of `chart` (after today). */
  planned: number;
  /** A month after the current one: only scheduled items, labelled Planned. */
  future: boolean;
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

const VIEWS = ["Month", "Year"] as const;

/** Categories as one strip, each part as long as its share (Everything else in grey). Hover or tap a part
 *  for its breakdown; keyboard users get the same from the legend buttons under it. */
function Strip({ cats, total, base, trigger }: { cats: Summary["byCategory"]; total: number; base: string; trigger: ReturnType<typeof usePopover<string>>["trigger"] }) {
  return (
    <div className="strip" role="img" aria-label={`Spending by category, total ${formatMinor(total, base)}`}>
      {cats.map((c) => <span key={c.category} className={`part tone-${categoryTone(c.category)}`} style={{ flexGrow: c.amount }} {...trigger(c.category)} />)}
    </div>
  );
}

/** This month so far against last month's same days: a thin line, ink up to the share, the part past
 *  100% in amber. Left out when there is no earlier month. The caption under it says it in words. */
function Compare({ ratio }: { ratio: number }) {
  const scale = Math.max(ratio, 1);
  return (
    <div className="compare" aria-hidden="true">
      <i style={{ width: `${(Math.min(ratio, 1) / scale) * 100}%` }} />
      {ratio > 1 && <i className="over" style={{ width: `${((ratio - 1) / scale) * 100}%` }} />}
    </div>
  );
}

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

/** The Daily card as a lattice of day cells, seven to a row from Monday (the Ledger's Week order). Spend
 *  lights a cell in four steps against the month's highest day. Today is ringed; days still to come with
 *  something scheduled are outlined (never lit, so planned days never read as spending); quiet days that
 *  have happened are a plain track; days still to come with nothing are empty. Every day that has
 *  happened, and every later day with something scheduled, is a button that opens that day in the Ledger. */
function Lattice({ days, from, elapsed, todayIdx, base, label, onOpen }: { days: number[]; from: string; elapsed: number; todayIdx: number; base: string; label: string; onOpen?: (date: string) => void }) {
  const max = Math.max(...days, 1);
  const lead = weekday(from);
  return (
    <div className="lattice" role="group" aria-label={label}>
      {WEEK.map((w, i) => <span key={`w${i}`} className="wk" aria-hidden="true">{w}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} className="cell blank" />)}
      {days.map((v, i) => {
        const past = i < elapsed;
        // Steps on the square root of the share of the highest day, so one rent day does not leave every other day on step 1.
        const lit = v <= 0 ? 0 : Math.sqrt(v / max);
        const step = lit === 0 ? 0 : lit > 0.75 ? 4 : lit > 0.5 ? 3 : lit > 0.25 ? 2 : 1;
        const cls = past ? (step ? `cell l${step}` : "cell quiet") : v > 0 ? "cell plan" : "cell later";
        const date = addDays(from, i);
        const title = `${labelShort(date)}: ${formatMinor(v, base)}${!past && v ? " planned" : ""}`;
        const className = i === todayIdx ? `${cls} now` : cls;
        if (!onOpen || (!past && v <= 0)) return <span key={i} className={className} title={title}>{i + 1}</span>;
        const what = !past ? `planned ${formatMinor(v, base)}` : v ? `spent ${formatMinor(v, base)}` : "nothing spent";
        return (
          <button key={i} type="button" className={className} title={title} aria-label={`${labelShort(date)}${i === todayIdx ? ", today" : ""}, ${what}, open in the Ledger`} onClick={() => onOpen(date)}>
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

/** `onOpenDay` opens one day in the Ledger's Day view (a tap on the Daily calendar); `onOpenLedger` opens the Month view at a date, as before. */
export function Dashboard({ onOpenPerson, onOpenLedger, onOpenDay, onOpenCardSettings, onAdd }: { onOpenPerson: (personId: string) => void; onOpenLedger: (date: string) => void; onOpenDay?: (date: string) => void; onOpenCardSettings: (cardId: string) => void; onAdd?: () => void }) {
  const { store, rev } = useLedger();
  const [anchor, setAnchor] = useState(today());
  const [v, setV] = useState<View>();
  // A card opened from its tile: the per-card statement view replaces the Dashboard until Back.
  const [openCard, setOpenCard] = useState<string>();
  const [fixing, setFixing] = useState(false);
  // Month or Year, one switch. The Year report is the old Year view, whole.
  const [view, setView] = useState<(typeof VIEWS)[number]>("Month");
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
      const future = from > t;
      const cur = summarize(future ? [] : ledgerItems(entries, rules, from, spentTo), base, from, to, world.entries, filter);
      // The chart also shows what is still scheduled this month (or, for a later month, only that).
      const plan = future || isCurrent ? plannedSummary(ledgerItems(entries, rules, from, to), base, from, to, t, world.entries, filter) : undefined;
      const chart = plan ?? cur;
      const planned = plan?.planned ?? 0;
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
      setV((old) => ({ dir: old && old.from !== from ? d : 0, acct, base, cur, chart, planned, future, prevTotal: prev.total, stillDue, from, isCurrent, balances, owed, next: fc.months[1], cards, banks, accounts: world.accounts, items: upToToday, salaryAccount: activeSalaryRule(world.rules, t)?.accountId, defaults: settings.defaults, orphans: orphans(world.entries, world.rules, allAccounts), allAccounts }));
    })();
    return () => { stale = true; };
  }, [store, rev, anchor, acct]);

  const switcher = <div className="dashswitch"><Segmented value={view} options={VIEWS} onChange={setView} /></div>;
  if (view === "Year") return <>{switcher}<YearView /></>;
  if (!v) return null;
  const { base, cur, chart, planned, future, prevTotal, stillDue, from, isCurrent, balances, owed, next, cards, banks, accounts, items, salaryAccount, defaults } = v;
  const fixable = v.orphans.entries.length + v.orphans.rules.length > 0;
  const showAccounts = balances.accounts.length > 0 || balances.unassigned !== 0 || fixable;
  const showOwed = owed.people.length > 0;
  const whatIf = accountsWhatIf(balances.totalBase, owed.net, cards.map((c) => c.st));
  const bottomCards = [showAccounts, showOwed, !!next].filter(Boolean).length;
  const cats = topCategories(chart.byCategory);
  // Shares of what was spent per category. A refund for an earlier month's purchase can leave a
  // category below zero; it is left out of the chart, so shares use the categories shown.
  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  const change = pctChange(cur.total, prevTotal);
  const todayIdx = isCurrent ? Number(today().slice(8)) - 1 : -1;
  // Days of this month that have happened: up to today, all of a past month, none of a future one.
  const elapsed = isCurrent ? todayIdx + 1 : from > today() ? 0 : cur.byDay.length;
  const daily = dailyStats(cur.byDay, elapsed);
  const upcoming = isCurrent && planned !== 0; // the chart includes the rest of this month's scheduled items
  const dailyLabel = `Daily spending from ${labelShort(from)}, average ${formatMinor(daily.average, base)} a day${daily.peak ? `, highest ${formatMinor(daily.peak.amount, base)} on ${labelShort(addDays(from, daily.peak.index))}` : ""}`;
  const opened = cards.find((c) => c.card.id === openCard);
  // Named from the loaded numbers' filter, so the tag never sits over the previous filter's figures while loading.
  const acctName = v.acct === NO_ACCOUNT ? "No account or removed" : accounts.find((a) => a.id === v.acct)?.name;
  // Named from what is loaded (month and filter), never the pickers, so it never sits over older numbers.
  const note = balanceNote(v.from, today(), acctName);

  // Going back never slides the month in again.
  const back = () => { setV({ ...v, dir: 0 }); setOpenCard(undefined); setSub(undefined); };

  if (sub) {
    return (
      <>
        <div className="toolrow">
          <span className="nav"><button className="title back" onClick={back}><PrevIcon />Dashboard</button></span>
        </div>
        <RecurringView />
      </>
    );
  }

  if (opened) {
    return (
      <>
        <div className="toolrow">
          <span className="nav"><button className="title back" onClick={back}><PrevIcon />Dashboard</button></span>
        </div>
        <CardView card={opened.card} st={opened.st} bd={opened.bd} banks={banks} items={items} accounts={accounts} onOpenLedger={onOpenLedger} onOpenCard={() => onOpenCardSettings(opened.card.id)} />
      </>
    );
  }

  // Under Spent: the pace in words, then how it compares with last month.
  const pace = elapsed > 0 ? `${formatMinor(daily.average, base)} a day, ${isCurrent ? `${elapsed} ${elapsed === 1 ? "day" : "days"} in` : `over ${elapsed} days`}. ` : "";
  const compared = change === null ? "No earlier month to compare yet." : change === 0 ? "Same as last month." : `${Math.abs(change)}% ${change < 0 ? "less" : "more"} than last month.`;

  return (
    <>
      {switcher}
      <div className="toolrow">
        <span className="nav">
          <button aria-label="Previous month" onClick={() => go(-1, (a) => addMonths(monthStart(a), -1))}><PrevIcon /></button>
          <button className="title" title="Go to this month" onClick={goToday}>{labelMonth(anchor)}</button>
          <button aria-label="Next month" onClick={() => go(1, (a) => addMonths(monthStart(a), 1))}><NextIcon /></button>
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
        <div className="card stat hero"><div className="mute">{future ? "Planned" : "Spent"}{acctName && <span className="tag">{acctName}</span>}</div><BigAmount minor={future ? chart.total : cur.total} currency={base} />
          {!future && prevTotal > 0 && <Compare ratio={cur.total / prevTotal} />}
          <div className="mute small">{future ? "Scheduled payments only" : pace + compared}</div></div>
        <div className="card stat"><div className="mute">Still due</div><BigAmount minor={stillDue} currency={base} />
          <div className="mute small">{isCurrent ? "yours, rest of this month" : "current month only"}</div></div>
        <div className="card stat"><div className="mute">Last month</div>
          {/* Nothing to compare (same rule as Spent's "No earlier data"): say so instead of ₱0.00. */}
          {prevTotal > 0 ? <BigAmount minor={prevTotal} currency={base} /> : <BigAmount currency={base} word="No data" className="nodata" />}
          <div className="mute small">{isCurrent ? "same days" : "full month"}</div></div>
      </div>

      {catTotal <= 0 ? (
        <Empty icon={<DashboardIcon />} title={future ? "Nothing planned" : "Nothing spent yet"} note={acctName ? `${labelMonth(from)}, ${acctName}` : labelMonth(from)}
          action={isCurrent && onAdd ? { label: "Add expense", onClick: onAdd } : undefined} />
      ) : (
        <div className="grid g2">
          <div ref={catRef} className={pop.open ? "card pad catcard popopen" : "card pad catcard"}>
            <div className="mute">Categories{future ? <span className="tag">Planned</span> : upcoming && <span className="tag">incl. upcoming</span>}</div>
            <Strip cats={cats} total={catTotal} base={base} trigger={pop.trigger} />
            <ul className="legend">
              {cats.map((c) => (
                <li key={c.category}>
                  <button type="button" aria-expanded={pop.openKey === c.category} aria-controls={pop.openKey === c.category ? "catpop" : undefined} {...pop.trigger(c.category)}>
                    <i className={`tone-${categoryTone(c.category)}`} /><span className="lname">{c.category}</span><span className="r">{formatMinor(c.amount, base)} <span className="mute">{Math.round((c.amount / catTotal) * 100)}%</span></span>
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
                  <div className="popamt"><b>{formatMinor(c.amount, base)}</b><span className="mute">{Math.round((c.amount / catTotal) * 100)}% of {future ? "planned" : "spending"}</span></div>
                  {c.members ? (
                    <ul className="poplist">
                      {c.members.map((m) => <li key={m.category}><span>{m.category}</span><span>{formatMinor(m.amount, base)}</span></li>)}
                    </ul>
                  ) : (
                    <ul className="poplist">
                      {(c.top ?? []).map((i, n) => <li key={n}><span>{i.label}<span className="mute"> {labelShort(i.date)}</span>{i.planned && <span className="tag">planned</span>}</span><span>{formatMinor(i.amount, base)}</span></li>)}
                    </ul>
                  )}
                </Popover>
              );
            })()}
          </div>
          <div className="card pad">
            <div className="dailyhead">
              <span className="mute">Daily{future ? <span className="tag">Planned</span> : upcoming && <span className="tag">incl. upcoming</span>}</span>
              {elapsed > 0 && <span className="mute small">{formatMinor(daily.average, base)} a day{isCurrent ? `, ${elapsed} ${elapsed === 1 ? "day" : "days"} in` : ""}</span>}
            </div>
            <Lattice days={chart.byDay} from={from} elapsed={elapsed} todayIdx={todayIdx} base={base} label={dailyLabel} onOpen={onOpenDay} />
            {/* Today and planned days are told apart by a ring and a dashed edge; say so in words too. */}
            <p className="mute small latkey">{isCurrent ? "Ringed: today. " : ""}{chart.byDay.some((d, i) => i >= elapsed && d > 0) ? "Dashed: planned. " : ""}Tap a day to open it in the Ledger.</p>
            <div className="dailystats">
              {future && <div className="row static"><span>Planned</span><span>{formatMinor(chart.total, base)}</span></div>}
              {upcoming && <div className="row static"><span>Still scheduled</span><span>{formatMinor(planned, base)}</span></div>}
              {daily.peak && <div className="row static"><span>Highest day</span><span>{formatMinor(daily.peak.amount, base)} <span className="mute">{labelShort(addDays(from, daily.peak.index))}</span></span></div>}
              {!future && <div className="row static"><span>No spending</span><span>{daily.quietDays} of {elapsed} {elapsed === 1 ? "day" : "days"}</span></div>}
            </div>
          </div>
        </div>
      )}
      {note && <p className="mute small hint balnote">{note}</p>}
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
              <button key={p.person.id} className="row" title={`Open ${p.person.name} in People`} onClick={() => onOpenPerson(p.person.id)}>
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
      {chart.unconverted > 0 && <p className="mute small">{chart.unconverted} foreign {chart.unconverted === 1 ? "amount has" : "amounts have"} no rate and {chart.unconverted === 1 ? "is" : "are"} left out.</p>}
      </div>
      {/* Outside the sliding period, so the sheet is never placed inside a moving box. */}
      {fixing && <FixSheet o={v.orphans} all={v.allAccounts} onClose={() => setFixing(false)} />}
    </>
  );
}
