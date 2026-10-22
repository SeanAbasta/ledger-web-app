import { useEffect, useState } from "react";
import { owedSummary, type OwedSummary } from "../../data/balances";
import { listAll, nameOf } from "../../data/collections";
import { comingUp, type BillRow, type ChargeRow, type ComingUp as Soon, type PayRow } from "../../data/comingUp";
import { labelShort, today } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Occurrence } from "../../data/rules";
import type { Account, Person, Rule } from "../../data/schema";
import { itemsToDate, loadWorld } from "../../data/world";
import { BigAmount } from "../../ui/Amount";
import { Empty } from "../../ui/Empty";
import { CalendarIcon, CheckIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { Segmented } from "../../ui/Segmented";
import { RecurringView } from "../dashboard/RecurringView";
import { Forecast } from "../forecast/Forecast";
import { PlanSheet } from "../ledger/PlanSheet";

const VIEWS = ["Soon", "12 months", "Plans"] as const;
type View = (typeof VIEWS)[number];
const KEY = "ledger.comingUp";

// The view is remembered per device, like the theme.
function loadView(): View {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "Soon";
  } catch {
    return "Soon";
  }
}
function saveView(v: View) {
  try { globalThis.localStorage?.setItem(KEY, v); } catch { /* storage blocked: the choice lasts until reload */ }
}

interface Data {
  c: Soon;
  owed: OwedSummary;
  base: string;
  accounts: (Account & { deleted?: true })[];
  people: Person[];
  rules: Rule[];
}

/** Soon: Bills in 30 days and Owed to you, then Bills to pay, Scheduled charges and Owed to you. */
function SoonView({ onOpenCard, onOpenPerson, onOpenLedger }: { onOpenCard: (cardId: string) => void; onOpenPerson: (id: string) => void; onOpenLedger: (date: string) => void }) {
  const { store, rev } = useLedger();
  const [d, setD] = useState<Data>();
  const [occ, setOcc] = useState<Occurrence>();

  useEffect(() => {
    let stale = false;
    (async () => {
      const w = await loadWorld(store);
      const t = today();
      const c = comingUp({ today: t, base: w.base, entries: w.entries, rules: w.rules, accounts: w.accounts });
      const owed = owedSummary(w.people, itemsToDate(w, t), w.base);
      const [accounts, people] = await Promise.all([listAll(store, "accounts"), listAll(store, "people")]);
      if (!stale) setD({ c, owed, base: w.base, accounts, people, rules: w.rules });
    })();
    return () => { stale = true; };
  }, [store, rev]);

  if (!d) return null;
  const { c, owed, base, accounts, people, rules } = d;
  const acct = (id?: string) => (id ? nameOf(id, accounts, "Removed account") : "No account");
  const owedPeople = owed.people.filter((p) => p.base > 0);
  if (!c.bills.length && !c.charges.length && !c.paid.length && !owedPeople.length) {
    return <Empty icon={<CalendarIcon />} title="Nothing is scheduled" note="Add a recurring or installment expense from Add." />;
  }
  const until = labelShort(c.until);
  const first = c.bills[0];
  const named = (b: BillRow | PayRow) => (b.kind === "bill" ? acct(b.cardId) : b.label);
  const sentence = first
    ? `${c.bills.length} to pay by ${until}. First: ${named(first)} on ${labelShort(first.date)}.`
    : `Nothing is due by ${until}.${c.next ? ` Next bill: ${acct(c.next.cardId)} on ${labelShort(c.next.due)}.` : ""}`;
  const open = (x: PayRow | ChargeRow) => (x.occ ? setOcc(x.occ) : onOpenLedger(x.date));

  const billRow = (b: BillRow) => (
    <button key={b.key} className="row bill-row" onClick={() => onOpenCard(b.cardId)}
      aria-label={`${labelShort(b.due)}, ${acct(b.cardId)} bill${b.estimate ? ", estimate" : ""}${b.overdue ? ", due now" : ""}, ${formatMinor(b.amount, base)}`}>
      <span className="when">{labelShort(b.due)}</span>
      <span className="what"><b>{acct(b.cardId)}{b.estimate && <span className="tag">Estimate</span>}{b.overdue && <span className="tag">due now</span>}</b>
        <span className="mute small">{b.estimate ? "bill, charged so far plus scheduled" : "bill"}</span></span>
      <span className="amt">{formatMinor(b.amount, base)}</span>
    </button>
  );
  const payRow = (p: PayRow) => (
    <button key={p.key} className="row bill-row" onClick={() => open(p)}>
      <span className="when">{labelShort(p.date)}</span>
      <span className="what"><b>{p.label}</b><span className="mute small">{acct(p.accountId)}{p.split ? `, full ${formatMinor(p.amount, p.currency)}` : ""}</span></span>
      <span className="amt">{p.yours === undefined ? <span className="mute small">no rate</span> : formatMinor(p.yours, base)}</span>
    </button>
  );
  const chargeRow = (x: ChargeRow) => (
    <button key={x.key} className="row sched-row" onClick={() => open(x)}>
      <span className="when">{labelShort(x.date)}</span>
      <span className="what"><b>{x.label}</b><span className="mute small">{acct(x.cardId)}{x.split && x.yours !== undefined ? `, yours ${formatMinor(x.yours, base)}` : ""}, lands on the {labelShort(x.billDue)} bill</span></span>
      <span className="amt">{formatMinor(x.amount, x.currency)}</span>
    </button>
  );

  return (
    <>
      <div className={owed.owedToMe > 0 ? "grid g2 soontop" : "grid soontop"}>
        <div className="card stat"><div className="mute">Bills in 30 days</div><BigAmount minor={c.total} currency={base} /><div className="mute small">cash that leaves your bank</div></div>
        {owed.owedToMe > 0 && <div className="card stat"><div className="mute">Owed to you</div><BigAmount minor={owed.owedToMe} currency={base} className="pos" /><div className="mute small">expected back this month{owed.iOwe > 0 ? `; you owe ${formatMinor(owed.iOwe, base)}` : ""}</div></div>}
      </div>
      <p className="soonline">{sentence}</p>

      {(c.bills.length > 0 || c.paid.length > 0) && (
        <>
          <div className="grp group-head" role="heading" aria-level={2}>Bills to pay<span className="r">cash leaves your bank</span></div>
          {c.bills.length > 0 && <div className="card">{c.bills.map((b) => (b.kind === "bill" ? billRow(b) : payRow(b)))}</div>}
          {c.paid.length > 0 && (
            <p className="paidline"><CheckIcon />Paid: {c.paid.map((p) => `${acct(p.cardId)} ${formatMinor(p.amount, base)}`).join(", ")}</p>
          )}
        </>
      )}
      {c.charges.length > 0 && (
        <>
          <div className="grp group-head" role="heading" aria-level={2}>Scheduled charges<span className="r">on cards, inside the bills</span></div>
          <div className="card">{c.charges.map(chargeRow)}</div>
        </>
      )}
      {owedPeople.length > 0 && (
        <>
          <div className="grp group-head" role="heading" aria-level={2}>Owed to you<span className="r">comes back to you</span></div>
          <div className="card">
            {owedPeople.map((p) => (
              <button key={p.person.id} className="row owed-row" onClick={() => onOpenPerson(p.person.id)}>
                <span className="what"><b>{p.person.name}</b><span className="mute small">owed, Settle up in People</span></span>
                <span className="amt pos">+{formatMinor(p.base, base)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="mute small soonfoot">A bill estimate counts future split charges at your share. The bank bills the full price, so its figure can be higher by the other person's part.</p>
      {c.unconverted > 0 && <p className="mute small">{c.unconverted} left out (no rate).</p>}
      {owed.skipped > 0 && <p className="mute small">{owed.skipped} foreign {owed.skipped === 1 ? "balance" : "balances"} left out (no rate).</p>}
      {occ && <PlanSheet occ={occ} rule={rules.find((r) => r.id === occ.ruleId)} people={people} onClose={() => setOcc(undefined)} />}
    </>
  );
}

/**
 * Coming up: what is next, and can I cover it. Soon (what leaves the bank in 30 days), 12 months (the
 * forecast, whole, with Salary at its foot) and Plans (every recurring and installment plan).
 */
export function ComingUp({ onOpenCard, onOpenPerson, onOpenLedger }: { onOpenCard: (cardId: string) => void; onOpenPerson: (id: string) => void; onOpenLedger: (date: string) => void }) {
  const [view, setView] = useState<View>(loadView);
  const pick = (v: View) => { setView(v); saveView(v); };
  return (
    <>
      <div className="cuswitch"><Segmented label="Coming up view" value={view} options={VIEWS} onChange={pick} /></div>
      {view === "Soon" ? <SoonView onOpenCard={onOpenCard} onOpenPerson={onOpenPerson} onOpenLedger={onOpenLedger} /> : view === "12 months" ? <Forecast /> : <RecurringView />}
    </>
  );
}
