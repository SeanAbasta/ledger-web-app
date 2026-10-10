import { useState } from "react";
import type { CardBreakdown, CardLine, CardStatus } from "../../data/cards";
import type { LedgerItem } from "../../data/rules";
import { labelShort } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Account } from "../../data/schema";
import { Segmented } from "../../ui/Segmented";
import { ReconcileSheet } from "./ReconcileSheet";

const TABS = ["Statement", "Unbilled", "Plans"] as const;
type Tab = (typeof TABS)[number];

/** What makes up each number on a card tile. Read-only; every list adds up to the tile's figure. */
export function CardView({ card, st, bd, banks, items, accounts, onOpenLedger, onOpenCard }: {
  card: Account; st: CardStatus; bd: CardBreakdown; banks: Account[]; items: LedgerItem[]; accounts: Account[];
  onOpenLedger: (date: string) => void; onOpenCard: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Statement");
  const [reconciling, setReconciling] = useState(false);
  const fmt = (n: number) => (n < 0 ? "-" : "") + formatMinor(Math.abs(n), card.currency);
  const bank = (id?: string) => banks.find((b) => b.id === id)?.name;

  function line(l: CardLine, i: number) {
    const it = l.item;
    const x = it && (it.type === "entry" ? it.entry : it.occ);
    let label: string;
    if (l.kind === "start") label = "Owed at start";
    else if (l.kind === "carried") label = l.amount >= 0 ? `Statement of ${labelShort(l.date!)}` : `Credit at ${labelShort(l.date!)}`;
    else if (l.kind === "credit") label = `Credit from ${labelShort(l.date!)}`;
    else if (l.kind === "ahead") label = "Paid ahead";
    else if (l.kind === "payment") label = "Payment";
    else label = x?.note || x?.category || "Charge";
    const from = l.kind === "payment" && x && "accountId" in x ? bank(x.accountId) : undefined;
    return (
      <div key={i} className="row static">
        <span>
          {label}
          {l.kind === "start" && <span className="mute"> &nbsp;before Ledger</span>}
          {from && <span className="mute"> &nbsp;from {from}</span>}
          {it?.type === "occurrence" && <span className="tag">{it.occ.type === "installment" ? `${it.occ.index} of ${it.occ.count}` : "recurring"}</span>}
          {it?.type === "entry" && it.entry.refund && <span className="tag">refund</span>}
          {x?.split && <span className="tag">split</span>}
          {l.date && l.kind !== "carried" && l.kind !== "credit" && <span className="mute small"> &nbsp;{labelShort(l.date)}</span>}
        </span>
        <span>{fmt(l.amount)}</span>
      </div>
    );
  }

  return (
    <div className="cardview">
      <h2 className="cvtitle">{card.name}</h2>
      <Segmented value={tab} options={TABS} onChange={setTab} />

      {tab === "Statement" && (
        <>
          <p className="mute">{st.statement || bd.statement.length ? `Statement of ${labelShort(st.cutoff)} · due ${labelShort(st.due)}` : `No statement on ${labelShort(st.cutoff)}`}</p>
          <div className="big">{fmt(st.statement)}</div>
          {bd.statement.length > 0 ? (
            <div className="card">{bd.statement.map(line)}</div>
          ) : (
            <p className="mute">Nothing on this statement.</p>
          )}
          {st.statement === 0 && bd.statement.length > 0 && <p className="mute small">The card was in credit at the cut-off, so there is nothing to pay. The credit goes toward the next bill.</p>}
          {bd.paidSince.length > 0 && (
            <>
              <div className="grp">Paid since {labelShort(st.cutoff)}</div>
              <div className="card">
                {bd.paidSince.map(line)}
                <div className="row static"><b>Left to pay</b><b>{st.remaining ? fmt(st.remaining) : "Paid"}</b></div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "Unbilled" && (
        <>
          <p className="mute">Since {labelShort(st.cutoff)}, on the next statement</p>
          <div className="big">{fmt(st.unbilled)}</div>
          {bd.unbilled.length > 0 ? (
            <div className="card">{bd.unbilled.map(line)}</div>
          ) : (
            <p className="mute">Nothing since the cut-off.</p>
          )}
        </>
      )}

      {tab === "Plans" && (
        <>
          <p className="mute">Holding the limit</p>
          <div className="big">{fmt(st.futureInstallments)}</div>
          {st.holds.length > 0 ? (
            <div className="card">
              {st.holds.map((h) => (
                <div key={h.ruleId} className="row static">
                  <span>{h.name}<span className="mute small sub">{h.count ? `${h.done} of ${h.count} paid` : `${h.left} left`} · next {labelShort(h.next)}, {fmt(h.each)}</span></span>
                  <span>{fmt(h.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mute">No installment plans on this card.</p>
          )}
          <p className="mute small">Payments still to come. Each plan's hold shrinks as payments are charged. Recurring payments never hold the limit.</p>
        </>
      )}

      <div className="actions"><button className="btn ghost" onClick={() => setReconciling(true)}>Reconcile with bank</button></div>
      {reconciling && (
        <ReconcileSheet card={card} st={st} bd={bd} items={items} accounts={accounts} onClose={() => setReconciling(false)} onOpenLedger={onOpenLedger} onOpenCard={onOpenCard} />
      )}
    </div>
  );
}
