import { useEffect, useState } from "react";
import { getSettings, list, listAll, nameOf } from "../../data/collections";
import { labelShort, today } from "../../data/dates";
import { formatMinor } from "../../data/money";
import { planList, type PlanList, type PlanRow } from "../../data/plans";
import type { Occurrence } from "../../data/rules";
import type { Account, Person, Rule } from "../../data/schema";
import { BigAmount } from "../../ui/Amount";
import { Empty } from "../../ui/Empty";
import { DashboardIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { PlanSheet } from "../ledger/PlanSheet";

const EVERY = { weekly: "a week", monthly: "a month", yearly: "a year" } as const;

/**
 * Every live recurring and installment plan, with what they cost a month (my share, base currency).
 * Tapping an active plan opens its next payment in the same sheet the Ledger uses. Salary is on Forecast.
 */
export function RecurringView() {
  const { store, rev } = useLedger();
  const [data, setData] = useState<{ list: PlanList; base: string; rules: Rule[]; accounts: (Account & { deleted?: true })[]; people: Person[] }>();
  const [occ, setOcc] = useState<Occurrence>();
  const [showEnded, setShowEnded] = useState(false);

  useEffect(() => {
    let stale = false;
    (async () => {
      const [settings, rules, accounts, people] = await Promise.all([getSettings(store), list(store, "rules"), listAll(store, "accounts"), listAll(store, "people")]);
      if (stale) return;
      setData({ list: planList(rules, today(), settings.baseCurrency), base: settings.baseCurrency, rules, accounts, people });
    })();
    return () => { stale = true; };
  }, [store, rev]);

  if (!data) return null;
  const { list: l, base, rules, accounts, people } = data;
  const active = l.recurring.length + l.installments.length;

  function row(r: PlanRow) {
    const acct = r.accountId ? nameOf(r.accountId, accounts, "Removed account") : "No account";
    const when = r.next ? `next ${labelShort(r.next.date)}` : r.last ? `last ${labelShort(r.last.date)}` : "no payments";
    const body = (
      <>
        <span>
          {r.label}
          {r.split && <span className="tag">split</span>}
          {r.progress && <span className="tag">{r.progress.done} of {r.progress.count}, {r.progress.left} left</span>}
          {r.end && r.next && <span className="tag">ends {labelShort(r.end)}</span>}
          <span className="mute small sub">{when} · {acct}</span>
        </span>
        <span className="planamt">{formatMinor(r.amount, r.currency)}<span className="mute small sub">{EVERY[r.frequency]}</span></span>
      </>
    );
    return r.next ? (
      <button key={r.rule.id} className="row" title="Edit" onClick={() => setOcc(r.next)}>{body}</button>
    ) : (
      <div key={r.rule.id} className="row static">{body}</div>
    );
  }

  return (
    <div className="cardview">
      <h2 className="cvtitle">Recurring payments</h2>
      {active + l.ended.length === 0 ? (
        <Empty icon={<DashboardIcon />} title="No recurring payments" note="Set Type to Recurring or Installment when you add an expense" />
      ) : (
        <>
          <p className="mute">A month, your share</p>
          <BigAmount minor={l.perMonth} currency={base} />
          {l.unconverted > 0 && <p className="mute small">{l.unconverted} foreign {l.unconverted === 1 ? "plan has" : "plans have"} no rate and {l.unconverted === 1 ? "is" : "are"} left out.</p>}
          {l.recurring.length > 0 && <><div className="grp" role="heading" aria-level={2}>Recurring</div><div className="card">{l.recurring.map(row)}</div></>}
          {l.installments.length > 0 && <><div className="grp" role="heading" aria-level={2}>Installments</div><div className="card">{l.installments.map(row)}</div></>}
          {l.ended.length > 0 && (
            <>
              <div className="grp" role="heading" aria-level={2}>Ended<button className="link" aria-expanded={showEnded} onClick={() => setShowEnded(!showEnded)}>{showEnded ? "Hide" : `Show ${l.ended.length}`}</button></div>
              {showEnded && <div className="card">{l.ended.map(row)}</div>}
            </>
          )}
          <p className="mute small">Tap a plan to edit, skip or end its next payment. Salary is on Forecast.</p>
        </>
      )}
      {occ && <PlanSheet occ={occ} rule={rules.find((r) => r.id === occ.ruleId)} people={people} onClose={() => setOcc(undefined)} />}
    </div>
  );
}
