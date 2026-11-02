import { useEffect, useId, useMemo, useRef, useState } from "react";
import { labelDay, labelShort, today } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import type { Trip, TripItem } from "../../data/schema";
import { baseOf, budgetLeft, concludedByCard, concludePlan, concludedTotals, concludeSummary, daysLeft, isFinal, owedLines, perDay, phaseText, tripEnd, tripPhase, tripTotals, waitingText } from "../../data/tripMath";
import { addTripItem, concludeTrip, deleteTrip, deleteTripItem, restoreTrip, restoreTripItems, undoConclude } from "../../data/tripOps";
import { categoryTone } from "../../ui/categoryColor";
import { ConfirmButton } from "../../ui/ConfirmButton";
import { CheckIcon, PrevIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { useSync } from "../../ui/Sync";
import { Dock, Sheet } from "../../ui/Sheet";
import { UNDO_FAILED, useToast } from "../../ui/Toast";
import { useWide } from "../../ui/useWide";
import { AddForm } from "../add/AddForm";
import { Statement } from "./Statement";
import { BudgetMeter, DayRail } from "./TripHeader";
import { accountLabel, type TravelData } from "./travelData";
import { TripForm } from "./TripForm";

const TABS = ["Expenses", "Statements", "Summary"] as const;
type Tab = (typeof TABS)[number];
// The view is remembered per trip on this device, so a different trip never opens on Summary by accident.
const keyOf = (tripId: string) => `ledger.trip.${tripId}`;
function loadTab(tripId: string): Tab {
  try {
    const v = globalThis.localStorage?.getItem(keyOf(tripId));
    return (TABS as readonly string[]).includes(v ?? "") ? (v as Tab) : "Expenses";
  } catch { return "Expenses"; }
}
function saveTab(tripId: string, v: Tab) {
  try { globalThis.localStorage?.setItem(keyOf(tripId), v); } catch { /* storage blocked: the choice lasts until reload */ }
}

/** One trip: its expenses, the statement step per card, and the summary with Conclude. */
export function TripView({ trip, data, onBack, onShowInLedger }: { trip: Trip; data: TravelData; onBack: () => void; onShowInLedger: (tripId: string) => void }) {
  const [tab, setTabState] = useState<Tab>(() => loadTab(trip.id));
  const setTab = (t: Tab) => { saveTab(trip.id, t); setTabState(t); };
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState<string>();
  const { show } = useToast();
  // Offline and read-only: the trip can still be opened and read; only what changes it is locked.
  const { readOnly } = useSync();
  const open = trip.status === "open";
  const items = useMemo(() => data.items.filter((i) => i.tripId === trip.id), [data.items, trip.id]);
  const totals = useMemo(() => tripTotals(trip, items, data.base), [trip, items, data.base]);

  if (adding && open) {
    return (
      <div className="tripview">
        <div className="toolrow"><span className="nav"><button className="title back" onClick={() => setAdding(false)}><PrevIcon />{trip.name}</button></span></div>
        <h2 className="cvtitle">Add expense</h2>
        <AddForm trip={{ trip }} onDone={(s) => { if (s) show({ message: s.toast ?? s.message, sub: s.sub, undo: s.undo }); }} />
      </div>
    );
  }

  return <Body trip={trip} data={data} items={items} totals={totals} tab={tab} setTab={setTab} card={card} setCard={setCard} onBack={onBack} onAdd={() => setAdding(true)} open={open} locked={readOnly} onShowInLedger={onShowInLedger} />;
}

function Body({ trip, data, items, totals, tab, setTab, card, setCard, onBack, onAdd, open, locked, onShowInLedger }: {
  locked: boolean; onShowInLedger: (tripId: string) => void;
  trip: Trip; data: TravelData; items: TripItem[]; totals: ReturnType<typeof tripTotals>; tab: Tab; setTab: (t: Tab) => void;
  card?: string; setCard: (c?: string) => void; onBack: () => void; onAdd: () => void; open: boolean;
}) {
  const base = data.base;
  const t = today();
  const left = budgetLeft(trip, totals);
  const day = perDay(trip, totals, t);
  const left_days = daysLeft(trip, t);
  const fmt = (n: number) => formatMinor(n, base);
  const range = `${labelShort(trip.start)}${trip.days > 1 ? ` to ${labelShort(tripEnd(trip))}` : ""}`;
  const budgetWords = trip.budget === undefined ? "" : left! >= 0
    ? `${fmt(left!)} left of ${fmt(trip.budget)}`
    : `${fmt(-left!)} over the ${fmt(trip.budget)} budget`;
  return (
    <div className="tripview">
      <div className="toolrow"><span className="nav"><button className="title back" onClick={onBack}><PrevIcon />Travel</button></span></div>
      <h2 className="cvtitle">{trip.name}</h2>
      {/* The rail shows a pattern, so it waits for a few expenses. */}
      {open && totals.count >= 3 && <DayRail trip={trip} items={items} base={base} today={t} />}
      <p className="mute tripline">
        {open ? `${tripPhase(trip, t).kind === "after" ? "Ended" : phaseText(trip, t)} · ${range}` : `Concluded · ${range}`}
      </p>
      {open && trip.budget !== undefined && (
        <>
          <p className="tripbudget" aria-live="polite">
            {budgetWords}
            {left! >= 0 && day !== undefined && left_days > 0 ? <span className="mute"> · {fmt(day)} a day for {left_days} {left_days === 1 ? "day" : "days"}</span> : null}
          </p>
          <BudgetMeter budget={trip.budget} mine={totals.mine} days={trip.days} label={budgetWords} />
        </>
      )}
      {open && <Segmented label="Trip view" value={tab} options={TABS} onChange={(v) => { setCard(undefined); setTab(v); }} />}
      {open && tab === "Expenses" && <Expenses trip={trip} data={data} items={items} onAdd={onAdd} locked={locked} />}
      {open && tab === "Statements" && <Statement trip={trip} data={data} items={items} card={card} onCard={setCard} open={open} locked={locked} />}
      {(!open || tab === "Summary") && <Summary trip={trip} data={data} items={items} totals={totals} locked={locked} onCard={(id) => { setCard(id); setTab("Statements"); }} onBack={onBack} onShowInLedger={onShowInLedger} />}
    </div>
  );
}

// ---- Expenses --------------------------------------------------------------------------------

function Expenses({ trip, data, items, onAdd, locked }: { trip: Trip; data: TravelData; items: TripItem[]; onAdd: () => void; locked: boolean }) {
  const base = data.base;
  const [editing, setEditing] = useState<TripItem>();
  const wide = useWide();
  const days = useMemo(() => {
    const by = new Map<string, TripItem[]>();
    for (const i of [...items].sort((a, z) => (a.date !== z.date ? (a.date < z.date ? 1 : -1) : a.createdAt < z.createdAt ? 1 : -1))) by.set(i.date, [...(by.get(i.date) ?? []), i]);
    return [...by];
  }, [items]);
  // The edit sheet shows the item as it is now; it closes when the item is gone.
  const current = editing && items.find((i) => i.id === editing.id);
  useEffect(() => { if (editing && !current) setEditing(undefined); }, [editing, current]);

  return (
    <>
      {!items.length ? (
        <p className="mute emptyline">Nothing logged on this trip yet.</p>
      ) : days.map(([date, its]) => {
        const sum = its.reduce((n, i) => n + (baseOf(i, trip, base) ?? 0) * (i.refund ? -1 : 1), 0);
        const est = its.some((i) => !isFinal(i, base));
        return (
          <div key={date}>
            <div className="grp day day-head" role="heading" aria-level={2} aria-label={sum === 0 ? labelDay(date) : `${labelDay(date)}, ${est ? "about " : ""}${formatMinor(Math.abs(sum), base)}${sum < 0 ? " back" : ""}`}>
              <span className="dnum" aria-hidden="true">{Number(date.slice(8))}</span>
              <span className="dname" aria-hidden="true">{labelDay(date).replace(/\s*\d+$/, "")}</span>
              <span className="r">{sum > 0 ? `${est ? "≈ " : ""}${formatMinor(sum, base)}` : sum < 0 ? <span className="in">+{est ? "≈ " : ""}{formatMinor(-sum, base)}</span> : ""}</span>
            </div>
            <div className="card">
              {its.map((i) => <ItemRow key={i.id} item={i} trip={trip} data={data} onOpen={() => setEditing(i)} />)}
            </div>
          </div>
        );
      })}
      {/* Add expense rides above the tab bar, like Save on the Add tab: the thumb reaches it. */}
      <div className="savebar addbar"><button type="button" className="btn" disabled={locked} onClick={onAdd}>Add expense</button></div>
      {current && (wide ? (
        <Dock onClose={() => setEditing(undefined)} locked><ItemSheet item={current} trip={trip} data={data} onClose={() => setEditing(undefined)} /></Dock>
      ) : (
        <Sheet onClose={() => setEditing(undefined)} locked><ItemSheet item={current} trip={trip} data={data} onClose={() => setEditing(undefined)} /></Sheet>
      ))}
    </>
  );
}

function ItemRow({ item, trip, data, onOpen }: { item: TripItem; trip: Trip; data: TravelData; onOpen: () => void }) {
  const base = data.base;
  const b = baseOf(item, trip, base);
  const final = isFinal(item, base);
  const foreign = item.currency !== base;
  const fmt = (n: number) => formatMinor(n, base);
  return (
    <button className="row item" onClick={onOpen} title="Edit">
      <span className="main">
        <span className="l1">{item.note || item.category || "Expense"}</span>
        <span className="l2">
          <i className={`dot tone-${categoryTone(item.category)}`} aria-hidden="true" />
          <span>{item.category || "Other"}</span>
          {item.split && <span className="tag">split</span>}
          {item.refund && <span className="tag">refund</span>}
          <span className="acct">{accountLabel(data.accounts, item.accountId)}</span>
        </span>
      </span>
      <span className={item.refund ? "money in" : "money"}>
        <span>{item.refund ? "+" : ""}{formatMinor(item.amount, item.currency)}</span>
        {/* Wet or set: an estimate is light and starts with a wavy equals; a final figure is firm and ticked. */}
        {foreign && (b === undefined ? <span className="approx">Add a rate</span> : final
          ? <span className="approx set"><CheckIcon />{fmt(b)}<span className="visually-hidden"> final</span></span>
          : <span className="approx wet">≈ {fmt(b)}<span className="visually-hidden"> estimated</span></span>)}
      </span>
    </button>
  );
}

function ItemSheet({ item, trip, data, onClose }: { item: TripItem; trip: Trip; data: TravelData; onClose: () => void }) {
  const { changed } = useLedger();
  const [refunding, setRefunding] = useState(false);
  const refunds = data.items.filter((i) => i.refund && i.refundOf === item.id);
  const left = item.amount - refunds.reduce((n, r) => n + r.amount, 0);
  if (refunding) return <RefundSheet item={item} left={left} onDone={() => { changed(); onClose(); }} onCancel={() => setRefunding(false)} />;
  if (item.refund) return <RefundOnly item={item} onClose={onClose} />;
  return (
    <>
      <h3>Edit expense</h3>
      <AddForm trip={{ trip, item }} onDone={onClose} />
      {left > 0 && <button type="button" className="btn ghost sm refundbtn" onClick={() => setRefunding(true)}>Refund</button>}
    </>
  );
}

function RefundSheet({ item, left, onDone, onCancel }: { item: TripItem; left: number; onDone: () => void; onCancel: () => void }) {
  const { store } = useLedger();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const minor = parseMinor(amount, item.currency);
    if (!minor) return setErr("Enter a valid amount");
    if (minor > left) return setErr("That is more than is left to refund");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setErr("Pick a date");
    try {
      await addTripItem(store, { tripId: item.tripId, date, amount: minor, currency: item.currency, rate: item.rate, category: item.category, note: item.note ? `Refund: ${item.note}` : "Refund", accountId: item.accountId, refund: true, refundOf: item.id });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }
  return (
    <>
      <h3>Refund</h3>
      <p className="mute small">Up to {formatMinor(left, item.currency)} of {item.note || item.category || "this expense"}. The statement shows the credit; type it on the Statements tab.</p>
      <label className="field"><b>Amount</b><MoneyInput value={amount} onChange={setAmount} currency={item.currency} autoFocus /></label>
      <label className="field"><b>When</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions"><button type="button" className="btn ghost" onClick={onCancel}>Back</button><button type="button" className="btn" onClick={() => void save()}>Save refund</button></div>
    </>
  );
}

function RefundOnly({ item, onClose }: { item: TripItem; onClose: () => void }) {
  const { store, changed } = useLedger();
  const { show } = useToast();
  return (
    <>
      <h3>Refund</h3>
      <p>{formatMinor(item.amount, item.currency)} back on {labelShort(item.date)}.</p>
      <div className="actions">
        <ConfirmButton danger label="Delete" ask="Delete this refund?" onConfirm={() => {
          void (async () => {
            const { removed } = await deleteTripItem(store, item.id);
            changed(); onClose();
            show({ message: "Deleted: refund", undo: async () => { await restoreTripItems(store, removed); }, failed: UNDO_FAILED.delete });
          })();
        }} />
      </div>
    </>
  );
}

// ---- Summary, the record and Conclude --------------------------------------------------------

function Summary({ trip, data, items, totals, locked, onCard, onBack, onShowInLedger }: { locked: boolean; onShowInLedger: (tripId: string) => void; trip: Trip; data: TravelData; items: TripItem[]; totals: ReturnType<typeof tripTotals>; onCard: (id: string) => void; onBack: () => void }) {
  const base = data.base;
  const { store, changed } = useLedger();
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const open = trip.status === "open";
  const fmt = (n: number) => formatMinor(n, base);
  const plan = useMemo(() => (open ? concludePlan(trip, items, data.accounts, base) : undefined), [open, trip, items, data.accounts, base]);
  const summary = plan && !plan.problems.length ? concludeSummary(plan.entries) : undefined;
  const reasons = useRef<HTMLParagraphElement>(null);
  const whyId = useId();
  // Conclude is the main button once the trip is over; while it runs it stays quiet, because more expenses are coming.
  const ended = tripPhase(trip, today()).kind === "after";
  const posted = useMemo(() => data.posted.filter((e) => e.tripId === trip.id), [data.posted, trip.id]);
  const record = useMemo(() => concludedTotals(posted), [posted]);
  const byCardPosted = useMemo(() => concludedByCard(posted), [posted]);

  async function conclude() {
    try {
      const { entries } = await concludeTrip(store, trip.id, data.accounts, base);
      changed();
      show({ message: `Concluded: ${trip.name}, ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`, undo: async () => { await undoConclude(store, trip.id); }, failed: "Could not undo. The entries are still in your Ledger." });
    } catch (e) {
      show({ message: e instanceof Error ? e.message : "Could not conclude" });
    }
  }
  async function remove() {
    const { stamp } = await deleteTrip(store, trip.id);
    changed();
    onBack();
    show({ message: `Deleted: ${trip.name}`, undo: async () => { await restoreTrip(store, trip.id, stamp); }, failed: "Could not undo. The trip is still deleted." });
  }

  const cardName = (id: string) => accountLabel(data.accounts, id === "none" ? undefined : id);
  const categories = open ? totals.byCategory : record.byCategory;
  const mine = open ? totals.mine : record.mine;
  const paid = open ? totals.paid : record.paid;
  const left = budgetLeft(trip, { mine });

  return (
    <>
      {/* The job first: what is left to do, then Conclude, then the figures. */}
      {open && plan && (
        <div className="concludebox">
          {summary ? (
            <p className="concludesum" aria-live="polite">
              Adds {summary.count} {summary.count === 1 ? "entry" : "entries"} to your Ledger{summary.from === summary.to ? ` on ${labelShort(summary.from)}` : ` from ${labelShort(summary.from)} to ${labelShort(summary.to)}`}, {fmt(summary.paid)}.
              {owedLines(summary.owed, data.people, fmt).map((l) => ` ${l}.`).join("")}
              {!ended && ` The trip runs to ${labelShort(tripEnd(trip))}.`}
            </p>
          ) : (
            <p className="concludewhy" id={whyId} ref={reasons} tabIndex={-1} aria-live="polite">
              {plan.problems.map((p, i) => <span key={i} className="why">{plan.waiting.length && p.startsWith(waitingText(plan.waiting, data.accounts)) ? (
                <>{plan.waiting.reduce((n, w) => n + w.count, 0)} still need{plan.waiting.reduce((n, w) => n + w.count, 0) === 1 ? "s" : ""} a statement amount: {plan.waiting.map((w, k) => (
                  <span key={w.accountId}>{k > 0 && ", "}<button type="button" className="textlink" onClick={() => onCard(w.accountId)}>{cardName(w.accountId)} {w.count}</button></span>
                ))}</>
              ) : p}</span>)}
            </p>
          )}
          <fieldset className="plain" disabled={locked}>
            {summary
              ? <ConfirmButton primary={ended} label="Conclude trip" ask={`Conclude ${summary.count} ${summary.count === 1 ? "entry" : "entries"}?`} onConfirm={() => void conclude()} />
              : <button type="button" className="btn ghost" aria-disabled="true" aria-describedby={whyId} onClick={() => reasons.current?.focus()}>Conclude trip</button>}
          </fieldset>
        </div>
      )}
      {!open && posted.length > 0 && (
        <div className="concludebox">
          <button type="button" className="btn" onClick={() => onShowInLedger(trip.id)}>Show in Ledger</button>
        </div>
      )}

      <div className="card tripfigures">
        {open ? <div className="row static"><span>Paid</span><span>{fmt(paid)}</span></div>
          : <div className="row static"><span>In your Ledger</span><span className="set"><CheckIcon />{fmt(paid)}</span></div>}
        {mine !== paid && <div className="row static"><span>Your share</span><span>{fmt(mine)}</span></div>}
        {open && <div className="row static"><span>Final</span><span>{totals.final} of {totals.count}</span></div>}
        {!open && <div className="row static"><span>Entries</span><span>{posted.length}</span></div>}
        {trip.budget !== undefined && <div className="row static"><span>Budget</span><span>{fmt(trip.budget)}</span></div>}
        {trip.budget !== undefined && left !== undefined && (left >= 0 ? <div className="row static"><span>{open ? "Left" : "Under budget by"}</span><span>{fmt(left)}</span></div> : <div className="row static"><span>Over budget by</span><span>{fmt(-left)}</span></div>)}
      </div>
      {open && totals.unrated > 0 && <p className="mute small hint">{totals.unrated} {totals.unrated === 1 ? "expense has" : "expenses have"} no rate and {totals.unrated === 1 ? "is" : "are"} left out. Add a rate under Edit trip.</p>}
      {!open && trip.budget !== undefined && <BudgetMeter budget={trip.budget} mine={mine} days={trip.days} label={left! >= 0 ? `${fmt(left!)} under the ${fmt(trip.budget)} budget` : `${fmt(-left!)} over the ${fmt(trip.budget)} budget`} />}

      {(open ? totals.byCard.length : byCardPosted.length) > 0 && (
        <>
          <div className="grp" role="heading" aria-level={2}>By card</div>
          <div className="card">
            {open
              ? totals.byCard.map((c) => (
                <button key={c.accountId} className="row" onClick={() => onCard(c.accountId)}>
                  <span>{cardName(c.accountId)}<span className="sub mute small">{c.final} of {c.count} final</span></span>
                  <span>{fmt(c.paid)}</span>
                </button>
              ))
              : byCardPosted.map((c) => (
                <div key={c.accountId} className="row static"><span>{cardName(c.accountId)}<span className="sub mute small">{c.count} {c.count === 1 ? "entry" : "entries"}</span></span><span>{fmt(c.paid)}</span></div>
              ))}
          </div>
        </>
      )}
      {categories.length > 0 && (
        <>
          <div className="grp" role="heading" aria-level={2}>By category</div>
          <div className="card">
            {categories.map((c) => (
              <div key={c.category} className="row static"><span><i className={`dot tone-${categoryTone(c.category)}`} aria-hidden="true" /> {c.category}</span><span>{fmt(c.paid)}</span></div>
            ))}
          </div>
        </>
      )}

      {!open && posted.length > 0 && (
        <>
          <div className="grp" role="heading" aria-level={2}>Expenses</div>
          <div className="card">
            {[...posted].sort((a, z) => (a.date !== z.date ? (a.date < z.date ? -1 : 1) : a.id < z.id ? -1 : 1)).map((e) => (
              <div key={e.id} className="row item static">
                <span className="main">
                  <span className="l1">{e.note || e.category || "Expense"}</span>
                  <span className="l2"><i className={`dot tone-${categoryTone(e.category)}`} aria-hidden="true" /><span>{e.category || "Other"}</span>{e.refund && <span className="tag">refund</span>}<span className="acct">{cardName(e.accountId ?? "none")}</span><span className="acct">{labelShort(e.date)}</span></span>
                </span>
                <span className={e.refund ? "money in" : "money"}>
                  <span>{e.refund ? "+" : ""}{fmt(e.amount)}</span>
                  {e.local && <span className="approx">{formatMinor(e.local.amount, e.local.currency)}</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quiet footer: editing and deleting never compete with Conclude. */}
      <fieldset className="plain" disabled={locked}>
        <div className="tripfoot">
          {open && <button type="button" className="btn ghost" onClick={() => setEditing(true)}>Edit trip</button>}
          <ConfirmButton danger label={open ? "Delete trip" : "Delete record"} ask={open ? `Delete ${trip.name} and its ${items.length} ${items.length === 1 ? "expense" : "expenses"}?` : `Delete the ${trip.name} record? Its ${posted.length} entries stay.`} onConfirm={() => void remove()} />
        </div>
      </fieldset>
      {editing && (
        <Sheet onClose={() => setEditing(false)} locked>
          <h3>Edit trip</h3>
          <TripForm trip={trip} onDone={() => setEditing(false)} />
        </Sheet>
      )}
    </>
  );
}
