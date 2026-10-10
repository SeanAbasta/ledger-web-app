import { useState } from "react";
import { upsert } from "../../data/collections";
import type { CardStatus } from "../../data/cards";
import { labelShort, today } from "../../data/dates";
import { addEntry } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import type { Account } from "../../data/schema";
import { useLedger } from "../../ui/Ledger";
import { MoneyInput } from "../../ui/MoneyInput";
import { Sheet } from "../../ui/Sheet";

const plain = (minor: number, cur: string) => formatMinor(minor, cur).replace(/[^\d.]/g, "");

type Choice = "statement" | "all" | "other";

/** One credit card: the last statement, what is unbilled, the credit left, and paying the bill. */
export function CardTile({ card, st, banks, defaultBank }: { card: Account; st: CardStatus; banks: Account[]; defaultBank?: string }) {
  const { store, changed } = useLedger();
  const [sheet, setSheet] = useState<"pay" | "due">();
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Choice>("statement");
  const [showHolds, setShowHolds] = useState(false);
  const cur = card.currency;
  const fmt = (n: number) => formatMinor(n, cur);
  const payFrom = banks.filter((b) => b.currency === cur); // a bill is paid in the card's currency
  const moved = !!card.dueOverrides?.[st.cutoff];
  const payAll = st.remaining + st.unbilled;
  // After the statement is paid, paying again goes toward the next one, so no manual transfer is needed.
  const payAhead = !st.remaining && (st.paid || st.unbilled > 0);

  function pick(c: Choice) {
    setChoice(c);
    setAmount(c === "statement" ? plain(st.remaining, cur) : c === "all" ? plain(payAll, cur) : "");
  }

  function open(which: "pay" | "due") {
    setError("");
    setFrom(payFrom.some((b) => b.id === defaultBank) ? defaultBank! : payFrom[0]?.id ?? "");
    pick(st.remaining ? "statement" : st.unbilled > 0 ? "all" : "other");
    setDate(today());
    setDue(st.due);
    setSheet(which);
  }

  async function pay() {
    setError("");
    const minor = parseMinor(amount, cur);
    if (!minor) return setError("Enter a valid amount");
    if (!from) return setError("Pick the account it is paid from");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date");
    try {
      await addEntry(store, { kind: "transfer", date, amount: minor, currency: cur, category: "Card payment", accountId: from, toAccountId: card.id });
      setSheet(undefined);
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }

  async function saveDue(value?: string) {
    setError("");
    if (value !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= st.cutoff)) return setError("Pick a date after the cut-off");
    const dueOverrides = { ...card.dueOverrides };
    if (value === undefined) delete dueOverrides[st.cutoff];
    else dueOverrides[st.cutoff] = value;
    await upsert(store, "accounts", { ...card, dueOverrides });
    setSheet(undefined);
    changed();
  }

  return (
    <div className="card pad">
      <div className="mute">{card.name}</div>
      <div className="big">{st.remaining ? fmt(st.remaining) : st.paid ? "Paid" : "Nothing due"}</div>
      <div className="mute small">
        {st.statement ? `statement of ${labelShort(st.cutoff)}${st.paid ? `, ${fmt(st.statement)}` : ""}` : `no statement on ${labelShort(st.cutoff)}`}
      </div>
      {st.statement > 0 && (
        <button className="row" title="Change the due date" onClick={() => open("due")}>
          <span>Due</span><span>{labelShort(st.due)}{moved && <span className="tag">moved</span>}</span>
        </button>
      )}
      <div className="row static"><span>Unbilled</span><span>{fmt(st.unbilled)}</span></div>
      {st.creditLeft !== undefined && (
        <div className="row static"><span>Credit left</span><span>{fmt(st.creditLeft)} <span className="mute small">of {fmt(card.limit!)}</span></span></div>
      )}
      {st.creditLeft !== undefined && st.holds.length === 1 && (
        <div className="row static hold"><span>{st.holds[0]!.name} hold</span><span>{fmt(st.holds[0]!.amount)}</span></div>
      )}
      {st.creditLeft !== undefined && st.holds.length > 1 && (
        <>
          <button className="row hold" aria-expanded={showHolds} title="Show each plan" onClick={() => setShowHolds(!showHolds)}>
            <span>Installment holds</span><span>{fmt(st.futureInstallments)}</span>
          </button>
          {showHolds && st.holds.map((h) => (
            <div key={h.ruleId} className="row static hold sub"><span>{h.name} <span className="small">{h.left} left</span></span><span>{fmt(h.amount)}</span></div>
          ))}
        </>
      )}
      {st.skipped > 0 && <p className="mute small">{st.skipped} foreign {st.skipped === 1 ? "amount has" : "amounts have"} no rate and {st.skipped === 1 ? "is" : "are"} left out.</p>}
      {st.remaining > 0 && <div className="actions"><button className="btn sm" onClick={() => open("pay")}>Pay</button></div>}
      {payAhead && <div className="actions"><button className="btn sm ghost" onClick={() => open("pay")}>Pay ahead</button></div>}

      {sheet === "pay" && (
        <Sheet locked onClose={() => setSheet(undefined)}>
          <h3>{st.remaining ? "Pay" : "Pay ahead on"} {card.name}</h3>
          <p className="mute">
            {st.remaining ? `Statement of ${labelShort(st.cutoff)}, due ${labelShort(st.due)}.` : "Goes toward the next statement."} Moves money from the bank to the card. Not counted as spending.
          </p>
          {payFrom.length ? (
            <form className="form" onSubmit={(e) => { e.preventDefault(); void pay(); }}>
              {(st.remaining > 0 || st.unbilled > 0) && <div className="choices" role="radiogroup" aria-label="How much">
                {st.remaining > 0 && <button type="button" role="radio" aria-checked={choice === "statement"} className={choice === "statement" ? "choice on" : "choice"} onClick={() => pick("statement")}>Statement<small>{fmt(st.remaining)}</small></button>}
                {st.unbilled > 0 && <button type="button" role="radio" aria-checked={choice === "all"} className={choice === "all" ? "choice on" : "choice"} onClick={() => pick("all")}>Pay all<small>{fmt(payAll)}</small></button>}
                <button type="button" role="radio" aria-checked={choice === "other"} className={choice === "other" ? "choice on" : "choice"} onClick={() => pick("other")}>Other<small>type it</small></button>
              </div>}
              <label className="field"><b>Amount</b><MoneyInput aria-label="Payment amount" value={amount} onChange={(v) => { setAmount(v); setChoice("other"); }} currency={cur} /></label>
              <label className="field"><b>From</b>
                <select value={from} onChange={(e) => setFrom(e.target.value)}>{payFrom.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              <label className="field"><b>Date</b><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              {error && <p className="err" role="alert">{error}</p>}
              <div className="actions"><button type="submit" className="btn">Pay</button></div>
            </form>
          ) : (
            <p className="mute">Add a {cur} bank account in Settings to pay from.</p>
          )}
        </Sheet>
      )}
      {sheet === "due" && (
        <Sheet locked onClose={() => setSheet(undefined)}>
          <h3>Due date</h3>
          <p className="mute">For the statement of {labelShort(st.cutoff)} only, for example when the bank moves it for a weekend or holiday.</p>
          <form className="form" onSubmit={(e) => { e.preventDefault(); void saveDue(due); }}>
            <label className="field"><b>Due</b><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="actions">
              {moved && <button type="button" className="btn ghost" onClick={() => void saveDue(undefined)}>Use the usual date</button>}
              <button type="submit" className="btn">Save</button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
