import { useEffect, useMemo, useState } from "react";
import { getSettings, list, upsert } from "../../data/collections";
import { toBase } from "../../data/base";
import { addDays, addMonths, labelDay, labelMonth, labelShort, monthEnd, monthStart, today, weekStart } from "../../data/dates";
import { addRefund, deleteEntry, loadAllEntries, loadEntries, refundable } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { ledgerItems, occurrences, type LedgerItem, type Occurrence } from "../../data/rules";
import { isCard, type Account, type Entry, type Person, type Rule } from "../../data/schema";
import { AddForm } from "../add/AddForm";
import { OccurrenceForm } from "./OccurrenceForm";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { useLedger } from "../../ui/Ledger";

const VIEWS = ["Day", "Week", "Month"] as const;
type View = (typeof VIEWS)[number];

function range(view: View, anchor: string): [string, string] {
  if (view === "Day") return [anchor, anchor];
  if (view === "Week") return [weekStart(anchor), addDays(weekStart(anchor), 6)];
  return [monthStart(anchor), monthEnd(anchor)];
}

function shift(view: View, anchor: string, dir: 1 | -1): string {
  return view === "Day" ? addDays(anchor, dir) : view === "Week" ? addDays(anchor, 7 * dir) : addMonths(monthStart(anchor), dir);
}

function title(view: View, anchor: string): string {
  const [a, b] = range(view, anchor);
  return view === "Day" ? labelDay(a) : view === "Week" ? `${labelShort(a)} to ${labelShort(b)}` : labelMonth(a);
}

export function Ledger() {
  const { store, rev, changed } = useLedger();
  const [view, setView] = useState<View>("Month");
  const [anchor, setAnchor] = useState(today());
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [base, setBase] = useState("PHP");
  const [editing, setEditing] = useState<Entry>();
  const [occ, setOcc] = useState<Occurrence>();
  const [editOcc, setEditOcc] = useState<Occurrence>();
  const [paid, setPaid] = useState<Entry>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refunding, setRefunding] = useState<{ entry: Entry; left: number }>();
  const [refundAmt, setRefundAmt] = useState("");
  const [refundDate, setRefundDate] = useState(today());
  const [refundErr, setRefundErr] = useState("");

  const [from, to] = range(view, anchor);

  useEffect(() => {
    (async () => {
      setEntries(await loadEntries(store, from, to));
      setRules(await list(store, "rules"));
      setPeople(await list(store, "people"));
      setAccounts(await list(store, "accounts"));
      setBase((await getSettings(store)).baseCurrency);
    })();
  }, [store, rev, from, to]);

  const t = today();
  const match = (it: LedgerItem) => {
    if (!q.trim()) return true;
    const x = it.type === "entry" ? it.entry : it.occ;
    const hay = [x.category, x.note, formatMinor(x.amount, x.currency), x.currency].join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };

  const items = useMemo(() => ledgerItems(entries, rules, from, to).filter((i) => i.type === "entry" || i.date <= t).filter(match), [entries, rules, from, to, t, q]);
  const due = useMemo(
    () => rules.flatMap((r) => occurrences(r, addDays(t, 1), addDays(t, 30))).sort((a, b) => (a.date < b.date ? -1 : 1)).filter((o) => o.kind === "expense"),
    [rules, t],
  );

  const groups = useMemo(() => {
    const g = new Map<string, LedgerItem[]>();
    for (const it of items) g.set(it.date, [...(g.get(it.date) ?? []), it]);
    return [...g.entries()];
  }, [items]);

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? "?";
  const onCard = (e: Entry) => accounts.some((a) => a.id === e.accountId && isCard(a));

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

  const personName = (id: string) => (id === "me" ? "me" : people.find((p) => p.id === id)?.name ?? "?");

  async function skipOcc(o: Occurrence) {
    const r = rules.find((x) => x.id === o.ruleId);
    if (r) await upsert(store, "rules", { ...r, skipped: [...(r.skipped ?? []), o.date] });
    setOcc(undefined);
    changed();
  }

  async function endSeries(o: Occurrence) {
    const r = rules.find((x) => x.id === o.ruleId);
    if (r) await upsert(store, "rules", { ...r, end: addDays(o.date, -1) });
    setOcc(undefined);
    changed();
  }

  const total = (its: LedgerItem[]) =>
    its.reduce((sum, it) => {
      const x = it.type === "entry" ? it.entry : it.occ;
      if (it.type === "entry" && it.entry.refund) return sum - (toBase(it.entry, base) ?? 0);
      if (x.kind !== "expense") return sum;
      return sum + (toBase(x, base) ?? 0);
    }, 0);

  // Spending shows as a minus; a day where refunds outweigh spending shows a plus.
  const dayTotal = (n: number) => (n > 0 ? "-" + formatMinor(n, base) : n < 0 ? "+" + formatMinor(-n, base) : "");

  return (
    <>
      <div className="toolrow">
        <Segmented value={view} options={VIEWS} onChange={setView} />
        <span className="nav">
          <button aria-label="Previous" onClick={() => setAnchor(shift(view, anchor, -1))}>‹</button>
          <span>{title(view, anchor)}</span>
          <button aria-label="Next" onClick={() => setAnchor(shift(view, anchor, 1))}>›</button>
        </span>
        <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {groups.length > 0 && <p className="mute small hint">Tap an entry to edit it</p>}

      {due.length > 0 && !q && (
        <>
          <div className="grp">Due soon</div>
          <div className="card">
            {due.slice(0, 5).map((o) => (
              <button key={o.ruleId + o.date} className="row" title="Edit" onClick={() => setOcc(o)}>
                <span>{labelShort(o.date)} &nbsp;{o.note || o.category}<span className="tag">{o.type === "installment" ? `${o.index} of ${o.count}` : "recurring"}</span></span>
                <span>{formatMinor(o.amount, o.currency)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {groups.length === 0 && <p className="mute empty">Nothing yet</p>}
      {groups.map(([date, its]) => (
        <div key={date}>
          <div className="grp">{labelDay(date)}<span className="r">{dayTotal(total(its))}</span></div>
          <div className="card">
            {its.map((it) => {
              const x = it.type === "entry" ? it.entry : it.occ;
              const b = toBase(x, base);
              return (
                <button key={it.type === "entry" ? it.entry.id : it.occ.ruleId + it.date} className="row" title="Edit" onClick={() => (it.type === "entry" ? (it.entry.kind === "settlement" || it.entry.kind === "transfer" ? setPaid(it.entry) : setEditing(it.entry)) : setOcc(it.occ))}>
                  <span>
                    {x.category}
                    {x.note && <span className="mute"> &nbsp;{x.note}</span>}
                    {it.type === "entry" && it.entry.kind === "transfer" && <span className="mute"> &nbsp;{accountName(it.entry.accountId)} to {accountName(it.entry.toAccountId)}</span>}
                    {x.split && <span className="tag">split</span>}
                    {it.type === "entry" && it.entry.refund && <span className="tag">refund</span>}
                    {it.type === "occurrence" && <span className="tag">{it.occ.type === "installment" ? `${it.occ.index} of ${it.occ.count}` : "recurring"}</span>}
                  </span>
                  <span>
                    {x.kind === "expense" || (x.kind === "settlement" && "direction" in x && x.direction === "out") ? "-" : it.type === "entry" && it.entry.refund ? "+" : ""}{formatMinor(x.amount, x.currency)}
                    {x.currency !== base && b !== undefined && <span className="mute small"> ≈ {formatMinor(b, base)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {editing && (
        <Sheet locked onClose={() => setEditing(undefined)}>
          <h3>{editing.refund ? "Edit refund" : editing.kind === "income" ? "Edit income" : "Edit expense"}</h3>
          <AddForm entry={editing} onDone={() => setEditing(undefined)} />
          {editing.kind === "expense" && onCard(editing) && (
            <div className="actions"><button className="btn ghost" onClick={() => void openRefund(editing)}>Refund</button></div>
          )}
        </Sheet>
      )}
      {paid && (
        <Sheet locked onClose={() => setPaid(undefined)}>
          <h3>{paid.note || paid.category || "Transfer"}</h3>
          <p className="mute">
            {labelDay(paid.date)} · {formatMinor(paid.amount, paid.currency)}
            {paid.kind === "transfer" && ` · ${accountName(paid.accountId)} to ${accountName(paid.toAccountId)}`}
          </p>
          <div className="actions">
            <button className="btn ghost danger" onClick={async () => { await deleteEntry(store, paid.date.slice(0, 7), paid.id); setPaid(undefined); changed(); }}>Delete</button>
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
      {editOcc && rules.find((r) => r.id === editOcc.ruleId) && (
        <Sheet locked onClose={() => setEditOcc(undefined)}>
          <h3>Edit payment</h3>
          <OccurrenceForm occ={editOcc} rule={rules.find((r) => r.id === editOcc.ruleId)!} onDone={() => setEditOcc(undefined)} />
        </Sheet>
      )}
      {occ && (
        <Sheet locked onClose={() => setOcc(undefined)}>
          <h3>{occ.note || occ.category}</h3>
          <p className="mute">
            {labelDay(occ.date)} · {formatMinor(occ.amount, occ.currency)}
            {occ.type === "installment" && ` · ${occ.index} of ${occ.count} · ${formatMinor(occ.remainingAfter ?? 0, occ.currency)} left after`}
          </p>
          {occ.split && <p className="mute small">Split with {occ.split.shares.map((s) => personName(s.personId)).join(", ")}</p>}
          <div className="actions">
            <button className="btn" onClick={() => { setEditOcc(occ); setOcc(undefined); }}>Edit</button>
            <button className="btn ghost" onClick={() => void skipOcc(occ)}>Skip this one</button>
            <button className="btn ghost danger" onClick={() => void endSeries(occ)}>End series</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
