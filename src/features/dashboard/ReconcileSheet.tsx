import { useEffect, useRef, useState } from "react";
import type { CardBreakdown, CardStatus } from "../../data/cards";
import { labelShort } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import { reconcile, type BankCheck, type BankField, type Cause } from "../../data/reconcile";
import type { LedgerItem } from "../../data/rules";
import type { Account } from "../../data/schema";
import { MoneyInput } from "../../ui/MoneyInput";
import { Sheet } from "../../ui/Sheet";

const LABEL: Record<BankField, string> = { statement: "Last statement", outstanding: "Outstanding balance", available: "Available credit" };

/** Type what the bank app shows; Ledger compares and names likely causes. Nothing is saved, not even the figures typed. */
export function ReconcileSheet({ card, st, bd, items, accounts, onClose, onOpenLedger, onOpenCard }: {
  card: Account; st: CardStatus; bd: CardBreakdown; items: LedgerItem[]; accounts: Account[];
  onClose: () => void; onOpenLedger: (date: string) => void; onOpenCard: () => void;
}) {
  const [typed, setTyped] = useState<Record<BankField, string>>({ statement: "", outstanding: "", available: "" });
  const [checks, setChecks] = useState<BankCheck[]>();
  const [error, setError] = useState("");
  const results = useRef<HTMLDivElement>(null);
  // On a phone the results land below the fold of the sheet, so bring them into view.
  useEffect(() => { if (checks) results.current?.scrollIntoView({ block: "nearest" }); }, [checks]);
  const cur = card.currency;
  const fmt = (n: number) => formatMinor(Math.abs(n), cur);
  const fields: BankField[] = card.limit === undefined ? ["statement", "outstanding"] : ["statement", "outstanding", "available"];
  const account = (id?: string) => accounts.find((a) => a.id === id)?.name ?? "no account";

  function compare() {
    setError("");
    const bank: Partial<Record<BankField, number>> = {};
    for (const f of fields) {
      if (!typed[f].trim()) continue;
      const v = parseMinor(typed[f], cur);
      if (v === null) return setError(`Enter a valid ${LABEL[f].toLowerCase()}`);
      bank[f] = v;
    }
    if (!Object.keys(bank).length) return setError("Type at least one figure from the bank app");
    setChecks(reconcile(card.id, st, bd, items, bank));
  }

  const name = (it: LedgerItem) => { const x = it.type === "entry" ? it.entry : it.occ; return x.note || x.category || "Entry"; };

  function cause(field: BankField, c: Cause, ledgerHigher: boolean, gap: number, i: number) {
    if (c.kind === "posting") {
      return (
        <div key={i} className="recon-cause">
          <p>{fmt(gap)} equals your {c.lines.length} charges dated {labelShort(c.date)}. {field !== "statement" ? (ledgerHigher ? "The bank may not have posted them yet." : "The bank may have posted them before Ledger did.") : `The bank may bill them on ${ledgerHigher ? "the next" : "an earlier"} statement.`}</p>
          <button className="btn ghost sm" onClick={() => onOpenLedger(c.date)}>Open {labelShort(c.date)} in Ledger</button>
        </div>
      );
    }
    if (c.kind === "pending") return <div key={i} className="recon-cause"><p>Equals everything since the cut-off ({fmt(c.amount)}). The bank may still show it as pending.</p></div>;
    if (c.kind === "entry") {
      const x = c.item.type === "entry" ? c.item.entry : c.item.occ;
      return (
        <div key={i} className="recon-cause">
          <p>Equals {name(c.item)} on {labelShort(c.item.date)}{c.onCard ? "" : `, saved on ${account(x.accountId)}`}. {c.onCard ? "It may be on another statement at the bank, typed wrong, or on the wrong card." : "It may belong on this card."}</p>
          <button className="btn ghost sm" onClick={() => onOpenLedger(c.item.date)}>Open in Ledger</button>
        </div>
      );
    }
    if (c.kind === "share") {
      return (
        <div key={i} className="recon-cause">
          <p>Equals a split share of {name(c.item)} on {labelShort(c.item.date)}. Check who paid and how it was split.</p>
          <button className="btn ghost sm" onClick={() => onOpenLedger(c.item.date)}>Open in Ledger</button>
        </div>
      );
    }
    return ledgerHigher ? (
      <div key={i} className="recon-cause"><p>No charge or group of charges matches this. Look for a charge entered twice or on the wrong card.</p></div>
    ) : (
      <div key={i} className="recon-cause">
        <p>No charge or group of charges matches this. It is likely a balance from before you started Ledger, interest or a fee.</p>
        <button className="btn ghost sm" onClick={onOpenCard}>Set as Owed at start</button>
      </div>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <h3>Reconcile {card.name}</h3>
      <p className="mute">From the bank app, any you have. Nothing here is saved.</p>
      <form className="form" onSubmit={(e) => { e.preventDefault(); compare(); }}>
        {fields.map((f) => (
          <label key={f} className="field"><b>{LABEL[f]}</b>
            <MoneyInput aria-label={LABEL[f]} placeholder="Optional" currency={cur} value={typed[f]} onChange={(v) => { setTyped({ ...typed, [f]: v }); setChecks(undefined); }} /></label>
        ))}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions"><button type="submit" className="btn">Compare</button></div>
      </form>
      {checks && (
        <div className="recon" ref={results}>
          {checks.map((c) => (
            <div key={c.field} className={c.diff ? "recon-item gap" : "recon-item matches"}>
              <p className="recon-head">{c.diff ? "!" : "✓"} <b>{LABEL[c.field]}</b>{!c.diff ? " matches" : c.field === "available" ? `: Ledger shows ${fmt(c.diff)} ${c.diff > 0 ? "less" : "more"} credit` : `: Ledger ${fmt(c.diff)} ${c.diff > 0 ? "higher" : "lower"}`}</p>
              {c.diff !== 0 && <p className="mute small">Bank {fmt(c.bank)}, Ledger {fmt(c.ledger)}</p>}
              {c.causes.map((x, i) => cause(c.field, x, c.diff > 0, c.diff, i))}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
