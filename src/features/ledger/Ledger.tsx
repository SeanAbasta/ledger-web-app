import { useEffect, useMemo, useRef, useState } from "react";
import { getSettings, list, listAll, nameOf } from "../../data/collections";
import { toBase } from "../../data/base";
import { addDays, addMonths, contains, labelDay, labelMonth, labelShort, monthStart, periodOf, today } from "../../data/dates";
import { categoryChoices, itemMatches } from "../../data/ledgerFilter";
import { addRefund, deleteEntry, loadAllEntries, loadEntries, refundable } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { ledgerItems, occurrences, type LedgerItem, type Occurrence } from "../../data/rules";
import { incomeEditor } from "../../data/sideIncome";
import { isCard, type Account, type Entry, type Person, type Rule } from "../../data/schema";
import { AddForm } from "../add/AddForm";
import { IncomeForm } from "../add/IncomeForm";
import { PlanSheet } from "./PlanSheet";
import { dayShare, shareLine } from "./rowShare";
import { NEXT_CARD_ROWS, cardVisible, nextCardKeys, withoutCardRows } from "./nextCard";
import { allTimeRange, emptyAction, groupByDay, groupByMonth } from "./allTime";
import { TransferForm } from "./TransferForm";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { confirmLabel } from "../../ui/confirm";
import { categoryTone } from "../../ui/categoryColor";
import { Empty } from "../../ui/Empty";
import { LedgerIcon, NextIcon, PrevIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { useTodayKey } from "../../ui/useTodayKey";

const VIEWS = ["Day", "Week", "Month"] as const;
export type View = (typeof VIEWS)[number];
type Dir = -1 | 0 | 1;

function shift(view: View, anchor: string, dir: 1 | -1): string {
  return view === "Day" ? addDays(anchor, dir) : view === "Week" ? addDays(anchor, 7 * dir) : addMonths(monthStart(anchor), dir);
}

function title(view: View, anchor: string): string {
  const [a, b] = periodOf(view, anchor);
  return view === "Day" ? labelDay(a) : view === "Week" ? `${labelShort(a)} to ${labelShort(b)}` : labelMonth(a);
}

/**
 * `initialDate` and `notice` come from the Add form: open where the new item is, and say it was saved.
 * `initialView` opens Day, Week or Month (default Month); a tap on the Dashboard calendar opens Day.
 * `onAdd` opens the Add tab (the empty state's button on the period that holds today).
 */
export function Ledger({ initialDate, initialView, notice, onAdd }: { initialDate?: string; initialView?: View; notice?: string; onAdd?: () => void } = {}) {
  const { store, rev, changed } = useLedger();
  const [view, setView] = useState<View>(initialView ?? "Month");
  const [anchor, setAnchor] = useState(initialDate ?? today());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(""); // "" is All categories
  const [categories, setCategories] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  // People and accounts including removed ones, so old entries still show their names.
  const [people, setPeople] = useState<Person[]>([]);
  const [base, setBase] = useState("PHP");
  const [editing, setEditing] = useState<Entry>();
  const [occ, setOcc] = useState<Occurrence>();
  const [paid, setPaid] = useState<Entry>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refunding, setRefunding] = useState<{ entry: Entry; left: number }>();
  const [refundAmt, setRefundAmt] = useState("");
  const [refundDate, setRefundDate] = useState(today());
  const [refundErr, setRefundErr] = useState("");
  // "Search all months": while searching or filtering, look through every month instead of the period.
  const [scope, setScope] = useState<"period" | "all">("period");
  const [allData, setAllData] = useState<{ entries: Entry[]; rules: Rule[] }>();

  const [from, to] = periodOf(view, anchor);
  // The period whose data is on screen. The list keeps showing it until the next period has loaded,
  // then swaps and slides in, so money figures never move or flash while loading.
  const [shown, setShown] = useState<{ from: string; to: string; dir: Dir }>({ from, to, dir: 0 });
  const dir = useRef<Dir>(0);

  useEffect(() => {
    let stale = false; // a slower load for a period already left must not overwrite a newer one
    (async () => {
      const [e, r, p, a, s] = await Promise.all([loadEntries(store, from, to), list(store, "rules"), listAll(store, "people"), listAll(store, "accounts"), getSettings(store)]);
      if (stale) return;
      setEntries(e);
      setRules(r);
      setPeople(p);
      setAccounts(a);
      setBase(s.baseCurrency);
      setCategories(s.categories);
      const d = dir.current; // read now: the updater below runs later
      dir.current = 0;
      setShown((cur) => (cur.from === from && cur.to === to ? cur : { from, to, dir: d }));
    })();
    return () => { stale = true; };
  }, [store, rev, from, to]);

  const go = (d: Dir, next: (a: string) => string) => { dir.current = d; setScope("period"); setAnchor(next); };

  const t = today();
  // "Next 30 days" counts from today, so it only shows on the period that holds today (it repeated upcoming rows elsewhere).
  const hasToday = contains([from, to], t);
  const listHasToday = contains([shown.from, shown.to], t);
  const goToday = () => { const n = today(); go(contains([from, to], n) ? 0 : n > from ? 1 : -1, () => n); };
  useTodayKey(goToday);
  // Generated payments after today show too (as upcoming), so a plan that starts later can be found and fixed.
  const all = useMemo(() => ledgerItems(entries, rules, shown.from, shown.to), [entries, rules, shown, t]);
  const items = useMemo(() => all.filter((it) => itemMatches(it, q, cat)), [all, q, cat]);
  const choices = useMemo(() => categoryChoices(all, categories, cat), [all, categories, cat]);
  const filtered = !!q.trim() || !!cat;
  const allScope = scope === "all" && filtered;
  // Clearing Search and the category goes back to the period.
  useEffect(() => { if (!filtered) setScope("period"); }, [filtered]);
  // Its own load and stale flag, so the period's slide and stale guard are untouched.
  useEffect(() => {
    if (scope !== "all") return;
    let stale = false;
    (async () => {
      const [e, r] = await Promise.all([loadAllEntries(store), list(store, "rules")]);
      if (!stale) setAllData({ entries: e, rules: r });
    })();
    return () => { stale = true; };
  }, [store, rev, scope]);
  const months = useMemo(() => {
    if (!allScope || !allData) return undefined;
    const range = allTimeRange(allData.entries, allData.rules, t);
    return groupByMonth(range ? ledgerItems(allData.entries, allData.rules, range[0], range[1]).filter((it) => itemMatches(it, q, cat)) : []);
  }, [allScope, allData, q, cat, t]);
  const upcoming = (it: LedgerItem) => it.type === "occurrence" && it.date > t;
  const due = useMemo(
    () => rules.flatMap((r) => occurrences(r, addDays(t, 1), addDays(t, 30))).sort((a, b) => (a.date < b.date ? -1 : 1)).filter((o) => o.kind === "expense"),
    [rules, t],
  );

  // A payment shown in the visible "Next 30 days" card is not listed again above today (it shows on its day).
  const showCard = cardVisible(listHasToday, due, filtered);
  const listed = useMemo(() => withoutCardRows(items, nextCardKeys(due, showCard)), [items, due, showCard]);

  const groups = useMemo(() => groupByDay(listed), [listed]);

  const accountName = (id?: string) => nameOf(id, accounts, "Removed account");
  const onCard = (e: Entry) => accounts.some((a) => a.id === e.accountId && !a.deleted && isCard(a));

  async function openRefund(e: Entry) {
    const left = refundable(e, await loadAllEntries(store));
    setRefundAmt(formatMinor(left, e.currency).replace(/[^\d.]/g, ""));
    setRefundDate(today());
    setRefundErr("");
    setEditing(undefined);
    setRefunding({ entry: e, left });
  }

  async function saveRefund() {
    if (!refunding) return;
    setRefundErr("");
    const minor = parseMinor(refundAmt, refunding.entry.currency);
    if (!minor) return setRefundErr("Enter a valid amount");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refundDate)) return setRefundErr("Pick a date");
    try {
      await addRefund(store, refunding.entry, minor, refundDate);
      setRefunding(undefined);
      changed();
    } catch (err) {
      setRefundErr(err instanceof Error ? err.message : "Could not save");
    }
  }

  const total = (its: LedgerItem[]) =>
    its.reduce((sum, it) => {
      if (upcoming(it)) return sum; // day totals are what happened
      const x = it.type === "entry" ? it.entry : it.occ;
      if (it.type === "entry" && it.entry.refund) return sum - (toBase(it.entry, base) ?? 0);
      if (x.kind !== "expense") return sum;
      return sum + (toBase(x, base) ?? 0);
    }, 0);

  // Spending reads plain (the list is spending); a day where refunds outweigh it shows a green plus.
  const dayTotal = (n: number) => (n > 0 ? formatMinor(n, base) : n < 0 ? <span className="in">+{formatMinor(-n, base)}</span> : "");
  // Money in (income, refunds, someone paying me back) is green with a plus; money out is plain.
  const moneyIn = (x: Entry | Occurrence) => x.kind === "income" || (x.kind === "settlement" && "direction" in x && x.direction === "in");

  // One day: its pinned header with the day total, then its rows. Used by the period and by all months.
  // The total is the full amount paid; "yours" under it is what it cost me, shown when the two differ.
  const dayBlock = (date: string, its: LedgerItem[]) => {
    const full = total(its);
    const happened = its.filter((it) => !upcoming(it));
    const yours = happened.length ? dayShare(happened, base, allScope && allData ? allData.entries : entries) : 0;
    return (
    <div key={date}>
      {/* The day stays pinned under the top bar while its rows scroll. */}
      <div className="grp day day-head" role="heading" aria-level={3}>{labelDay(date)}<span className="r">{dayTotal(full)}{yours !== full && <span className="dayyours">yours {formatMinor(yours, base)}</span>}</span></div>
      <div className="card">
        {its.map((it) => {
          const x = it.type === "entry" ? it.entry : it.occ;
          const b = toBase(x, base);
          const transfer = it.type === "entry" && it.entry.kind === "transfer";
          const later = upcoming(it);
          const share = shareLine(it); // split rows: what it cost me (day totals stay the full amount)
          return (
            <button key={it.type === "entry" ? it.entry.id : it.occ.ruleId + it.date} className="row item" title="Edit" onClick={() => (it.type === "entry" ? (it.entry.kind === "settlement" || it.entry.kind === "transfer" ? setPaid(it.entry) : setEditing(it.entry)) : setOcc(it.occ))}>
              {/* What it was first; then its colour, category (or the two accounts of a transfer) and tags. */}
              <span className="main">
                <span className="l1">{x.note || x.category || "Transfer"}</span>
                <span className="l2">
                  <i className={`dot tone-${categoryTone(x.category)}`} aria-hidden="true" />
                  <span>{transfer ? `${accountName(it.entry.accountId)} to ${accountName(it.entry.toAccountId)}` : x.category || "Other"}</span>
                  {x.split && <span className="tag">split</span>}
                  {it.type === "entry" && it.entry.refund && <span className="tag">refund</span>}
                  {it.type === "entry" && it.entry.nextBill && <span className="tag">next bill</span>}
                  {it.type === "occurrence" && <span className="tag">{it.occ.type === "installment" ? `${it.occ.index} of ${it.occ.count}` : "recurring"}</span>}
                  {later && <span className="tag">upcoming</span>}
                </span>
              </span>
              <span className={later ? "money later" : moneyIn(x) ? "money in" : "money"}>
                <span>{moneyIn(x) ? "+" : ""}{formatMinor(x.amount, x.currency)}</span>
                {x.currency !== base && b !== undefined && <span className="approx">≈ {formatMinor(b, base)}</span>}
                {share && <span className="share">{share}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    );
  };

  return (
    <>
      <div className="toolrow">
        <Segmented value={view} options={VIEWS} onChange={(v) => { dir.current = 0; setScope("period"); setView(v); }} />
        <span className="nav">
          <button aria-label="Previous" onClick={() => go(-1, (a) => shift(view, a, -1))}><PrevIcon /></button>
          <button className="title" title="Go to today" onClick={goToday}>{title(view, anchor)}</button>
          <button aria-label="Next" onClick={() => go(1, (a) => shift(view, a, 1))}><NextIcon /></button>
          <button className={hasToday ? "today off" : "today"} onClick={goToday}>Today</button>
        </span>
        <span className="filters">
          <input className="search" aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="catpick" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {choices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </span>
      </div>

      {notice && <p className="mute small hint" role="status">{notice}</p>}
      {filtered && (
        <p className="mute small hint scopeline">
          {allScope
            ? <>In all months. <button type="button" className="link" onClick={() => setScope("period")}>Back to {title(view, shown.from)}</button></>
            : <>In {title(view, shown.from)}. <button type="button" className="link" onClick={() => setScope("all")}>Search all months</button></>}
        </p>
      )}

      {allScope ? (
        // All months: outside the keyed period div, so it never slides; month headings, then the usual days.
        months && (months.length === 0
          ? <Empty icon={<LedgerIcon />} title="No matches" note={`Nothing${cat ? ` in ${cat}` : ""} in any month${q.trim() ? ` has "${q.trim()}"` : ""}`} />
          : months.map(([m, days]) => (
            <div key={m}>
              <div className="grp month" role="heading" aria-level={2}>{labelMonth(`${m}-01`)}</div>
              {days.map(([date, its]) => dayBlock(date, its))}
            </div>
          )))
      ) : (
      <div key={`${shown.from}/${shown.to}`} className={shown.dir === 1 ? "period next" : shown.dir === -1 ? "period prev" : "period"}>
      {showCard && (
        <>
          <div className="grp" role="heading" aria-level={2}>Next 30 days</div>
          <div className="card nextcard">
            {due.slice(0, NEXT_CARD_ROWS).map((o) => (
              <button key={o.ruleId + o.date} className="row" title="Edit" onClick={() => setOcc(o)}>
                <span>{labelShort(o.date)} &nbsp;{o.note || o.category}<span className="tag">{o.type === "installment" ? `${o.index} of ${o.count}` : "recurring"}</span></span>
                <span className="money later">{formatMinor(o.amount, o.currency)}{o.split && <span className="share">{shareLine({ type: "occurrence", date: o.date, occ: o })}</span>}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {groups.length === 0 && (filtered
        ? <Empty icon={<LedgerIcon />} title="No matches" note={`Nothing${cat ? ` in ${cat}` : ""} in ${title(view, shown.from)}${q.trim() ? ` has "${q.trim()}"` : ""}`} action={{ label: "Search all months", onClick: () => setScope("all") }} />
        : <Empty icon={<LedgerIcon />} title="Nothing logged" note={title(view, shown.from)} action={emptyAction([shown.from, shown.to], t, false) === "add" && onAdd ? { label: "Add expense", onClick: onAdd } : undefined} />)}
      {groups.map(([date, its]) => dayBlock(date, its))}
      </div>
      )}

      {editing && (
        <Sheet locked onClose={() => setEditing(undefined)}>
          <h3>{editing.refund ? "Edit refund" : editing.kind === "income" ? "Edit income" : "Edit expense"}</h3>
          {/* One-off side income opens its own form; salary entries and refunds open the expense form as before. */}
          {incomeEditor(editing) === "income" ? <IncomeForm entry={editing} onDone={() => setEditing(undefined)} /> : <AddForm entry={editing} onDone={() => setEditing(undefined)} />}
          {editing.kind === "expense" && onCard(editing) && (
            <div className="actions"><button className="btn ghost" onClick={() => void openRefund(editing)}>Refund</button></div>
          )}
        </Sheet>
      )}
      {paid?.kind === "transfer" && (
        <Sheet locked onClose={() => setPaid(undefined)}>
          <h3>{paid.category === "Card payment" ? "Edit card payment" : "Edit transfer"}</h3>
          <TransferForm entry={paid} accounts={accounts} onDone={() => setPaid(undefined)} />
        </Sheet>
      )}
      {paid && paid.kind !== "transfer" && (
        <Sheet locked onClose={() => setPaid(undefined)}>
          <h3>{paid.note || paid.category || "Transfer"}</h3>
          <p className="mute">
            {labelDay(paid.date)} · {formatMinor(paid.amount, paid.currency)}
          </p>
          <div className="actions">
            <ConfirmButton danger label="Delete" ask={confirmLabel("delete", paid)} onConfirm={async () => { await deleteEntry(store, paid.date.slice(0, 7), paid.id); setPaid(undefined); changed(); }} />
          </div>
        </Sheet>
      )}
      {refunding && (
        <Sheet locked onClose={() => setRefunding(undefined)}>
          <h3>Refund</h3>
          <p className="mute">{refunding.entry.note || refunding.entry.category} · {labelDay(refunding.entry.date)} · {formatMinor(refunding.entry.amount, refunding.entry.currency)} on {accountName(refunding.entry.accountId)}</p>
          {refunding.left > 0 ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void saveRefund(); }}>
              <label className="field"><b>Amount</b><MoneyInput aria-label="Refund amount" value={refundAmt} onChange={setRefundAmt} currency={refunding.entry.currency} /></label>
              <label className="field"><b>Date</b><input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} /></label>
              {refunding.left < refunding.entry.amount && <p className="mute small">{formatMinor(refunding.left, refunding.entry.currency)} left to refund</p>}
              {refundErr && <p className="err" role="alert">{refundErr}</p>}
              <div className="actions"><button type="submit" className="btn">Save refund</button></div>
            </form>
          ) : (
            <p className="mute">Already fully refunded.</p>
          )}
        </Sheet>
      )}
      {/* A generated payment: Edit, Skip this one, End series (shared with the Dashboard's Recurring list). */}
      {occ && <PlanSheet occ={occ} rule={rules.find((r) => r.id === occ.ruleId)} people={people} onClose={() => setOcc(undefined)} />}
    </>
  );
}
