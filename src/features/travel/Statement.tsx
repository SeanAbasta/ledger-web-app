import { useRef, useState } from "react";
import { labelShort } from "../../data/dates";
import { formatMinor, parseMinor } from "../../data/money";
import { NO_ACCOUNT } from "../../data/summary";
import type { Trip, TripItem } from "../../data/schema";
import { againstEstimate, baseOf, isFinal, needsFigure, statementOrder } from "../../data/tripMath";
import { updateTripItem } from "../../data/tripOps";
import { CheckIcon, PrevIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { MoneyInput } from "../../ui/MoneyInput";
import { accountLabel, type TravelData } from "./travelData";

/**
 * The statement step, one card at a time. Each foreign expense has one field for the PHP the statement
 * shows (the foreign fee is already inside that figure). Typing it makes the expense final; clearing it
 * makes it an estimate again. Return moves to the next field.
 */
export function Statement({ trip, data, items, card, onCard, open, locked }: { trip: Trip; data: TravelData; items: TripItem[]; card?: string; onCard: (id?: string) => void; open: boolean; locked: boolean }) {
  const base = data.base;
  if (!items.length) return <p className="mute emptyline">{open ? "Nothing logged on this trip yet." : "This trip had no expenses."}</p>;
  if (!open) return <p className="mute emptyline">This trip is concluded. Its expenses are in your Ledger.</p>;

  const cards = [...new Set(items.map((i) => i.accountId ?? NO_ACCOUNT))];
  if (card && cards.includes(card)) return <CardStatement trip={trip} data={data} items={items.filter((i) => (i.accountId ?? NO_ACCOUNT) === card)} card={card} locked={locked} onBack={() => onCard(undefined)} />;

  return (
    <>
      <p className="mute small hint">Pick a card, then type each amount the statement shows. Amounts already in {base} need nothing.</p>
      <div className="card">
        {cards.map((id) => {
          const its = items.filter((i) => (i.accountId ?? NO_ACCOUNT) === id);
          const need = its.filter((i) => needsFigure(i, base));
          const done = need.filter((i) => isFinal(i, base)).length;
          const paid = its.reduce((n, i) => n + (baseOf(i, trip, base) ?? 0) * (i.refund ? -1 : 1), 0);
          return (
            <button key={id} className="row" onClick={() => onCard(id)}>
              <span>{accountLabel(data.accounts, id === NO_ACCOUNT ? undefined : id)}<span className="sub mute small">{need.length ? `${done} of ${need.length} statement amounts typed` : `${its.length} in ${base}, nothing to type`}</span>
                {need.length > 0 && <span className="tripprog" role="meter" aria-label="Statement amounts typed" aria-valuemin={0} aria-valuemax={need.length} aria-valuenow={done} aria-valuetext={`${done} of ${need.length} typed`}><i style={{ width: `${(done / need.length) * 100}%` }} /></span>}
              </span>
              <span>{formatMinor(paid, base)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function CardStatement({ trip, data, items, card, locked, onBack }: { trip: Trip; data: TravelData; items: TripItem[]; card: string; locked: boolean; onBack: () => void }) {
  const base = data.base;
  const name = accountLabel(data.accounts, card === NO_ACCOUNT ? undefined : card);
  const list = useRef<HTMLDivElement>(null);
  const ordered = [...items].sort(statementOrder);
  const need = ordered.filter((i) => needsFigure(i, base));
  const done = need.filter((i) => isFinal(i, base)).length;
  const lines = ordered.reduce((n, i) => n + (baseOf(i, trip, base) ?? 0) * (i.refund ? -1 : 1), 0);
  const [total, setTotal] = useState("");
  const typed = parseMinor(total, base);
  const diff = typed ? typed - lines : undefined;

  const next = (from: HTMLInputElement) => {
    const inputs = [...(list.current?.querySelectorAll<HTMLInputElement>("input.stmt") ?? [])];
    const at = inputs.indexOf(from);
    inputs[at + 1]?.focus();
  };

  return (
    <>
      <div className="toolrow"><span className="nav"><button className="title back" onClick={onBack}><PrevIcon />Cards</button></span></div>
      <h3 className="cvtitle">{name}</h3>
      <p className="mute stmtprogress" aria-live="polite">{need.length ? `${done} of ${need.length} statement amounts typed` : `Everything on ${name} is already in ${base}.`}</p>
      <fieldset className="plain" disabled={locked}>
        <div className="card" ref={list}>
          {ordered.map((i) => <StatementRow key={i.id} item={i} trip={trip} base={base} onNext={next} />)}
        </div>
        <label className="field stack stmttotal"><b>Statement total for this trip<span className="mute small sub">Optional. Type what the statement says these charges add up to, to check the lines.</span></b>
          <MoneyInput value={total} onChange={setTotal} currency={base} placeholder="0.00" />
        </label>
      </fieldset>
      {diff !== undefined && (
        <p className="mute stmtcheck" aria-live="polite">
          {diff === 0 ? `Matches the lines: ${formatMinor(lines, base)}.` : `The statement is ${formatMinor(Math.abs(diff), base)} ${diff > 0 ? "more" : "less"} than the lines (${formatMinor(lines, base)}).`}
          {diff !== 0 && done < need.length ? " Some lines are still estimates." : ""}
        </p>
      )}
    </>
  );
}

function StatementRow({ item, trip, base, onNext }: { item: TripItem; trip: Trip; base: string; onNext: (from: HTMLInputElement) => void }) {
  const { store, changed } = useLedger();
  const needs = needsFigure(item, base);
  const est = baseOf({ ...item, final: undefined }, trip, base);
  const [val, setVal] = useState(item.final !== undefined ? formatMinor(item.final, base).replace(/[^\d.]/g, "") : "");
  const [err, setErr] = useState("");

  async function commit() {
    setErr("");
    const minor = val.trim() ? parseMinor(val, base) : undefined;
    if (val.trim() && !minor) return setErr("Enter an amount");
    if (minor === (item.final ?? undefined)) return;
    try {
      await updateTripItem(store, item.id, { final: minor ?? undefined });
      changed();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }

  return (
    <div className={needs ? "stmtrow" : "stmtrow done"}>
      <span className="main">
        <span className="l1">{item.note || item.category || "Expense"}{item.refund && <span className="tag">refund</span>}</span>
        <span className="l2">
          <span>{labelShort(item.date)}</span><span>{formatMinor(item.amount, item.currency)}</span>
          {needs && item.final === undefined && est !== undefined && <span className="wet">≈ {formatMinor(est, base)}</span>}
          {needs && item.final !== undefined && <span className="set"><CheckIcon />final<span className="visually-hidden">, {againstEstimate(item.final, est, (n) => formatMinor(n, base)) || "typed"}</span></span>}
        </span>
        {needs && item.final !== undefined && est !== undefined && <span className="mute small stmtdiff">{againstEstimate(item.final, est, (n) => formatMinor(n, base))}</span>}
      </span>
      {needs ? (
        <span className="stmtfield">
          <MoneyInput className="stmt" aria-label={`${item.refund ? "Credit" : "Statement amount"} in ${base} for ${item.note || item.category || "expense"}, ${labelShort(item.date)}`} placeholder={est !== undefined ? formatMinor(est, base).replace(/[^\d.,]/g, "") : base}
            value={val} onChange={setVal} currency={base} onBlur={() => void commit()}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void commit(); onNext(e.currentTarget); } }} />
          {err && <span className="err" role="alert">{err}</span>}
        </span>
      ) : <span className="mute small">in {base}</span>}
    </div>
  );
}
