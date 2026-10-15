import { useState } from "react";
import { reassignAccounts } from "../../data/accountMove";
import { nameOf } from "../../data/collections";
import { labelShort } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Account } from "../../data/schema";
import type { Orphans } from "../../data/usage";
import { AccountOptions } from "../../ui/AccountOptions";
import { useLedger } from "../../ui/Ledger";
import { Sheet } from "../../ui/Sheet";

const SHOWN = 12;

/** Entries and plans whose account was removed: list them and move them all to one account. */
export function FixSheet({ o, all, onClose }: { o: Orphans; all: Account[]; onClose: () => void }) {
  const { store, changed } = useLedger();
  const live = all.filter((a) => !a.deleted);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const name = (id?: string) => nameOf(id, all, "Removed account");
  const gone = (id?: string) => !!id && o.ids.includes(id);
  // Which end is missing: "on Card A (removed)", or for a transfer "Bank A to Card A (removed)".
  const where = (from?: string, into?: string) => (into !== undefined ? `${name(from)} to ${name(into)}` : `on ${name(from)}`);
  const rows = [
    ...o.entries.map((e) => ({ key: e.id, what: e.note || e.category || "Transfer", sub: `${labelShort(e.date)} · ${where(e.accountId, e.toAccountId)}`, amount: formatMinor(e.amount, e.currency) })),
    ...o.rules.map((r) => ({ key: r.id, what: `Plan: ${r.note || r.category || "Payment"}`, sub: `on ${[r.accountId, ...(r.revisions ?? []).map((x) => x.accountId)].filter(gone).map(name).filter((x, i, xs) => xs.indexOf(x) === i).join(", ")}`, amount: formatMinor(r.amount, r.currency) })),
  ];
  const count = [o.entries.length && `${o.entries.length} ${o.entries.length === 1 ? "entry" : "entries"}`, o.rules.length && `${o.rules.length} ${o.rules.length === 1 ? "plan" : "plans"}`].filter(Boolean).join(" and ");

  async function move() {
    setError("");
    try {
      const r = await reassignAccounts(store, o.ids, to);
      changed();
      if (!r.kept) return onClose();
      setMsg(`Moved. ${r.kept} ${r.kept === 1 ? "transfer was" : "transfers were"} left as ${r.kept === 1 ? "it was" : "they were"}, because ${r.kept === 1 ? "it" : "they"} would go from ${live.find((a) => a.id === to)?.name} to itself. Edit or delete ${r.kept === 1 ? "it" : "them"} in the Ledger.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move");
    }
  }

  return (
    <Sheet locked onClose={onClose}>
      <h3>Fix removed accounts</h3>
      {msg ? (
        <>
          <p className="mute">{msg}</p>
          <div className="actions"><button className="btn" onClick={onClose}>Done</button></div>
        </>
      ) : (
        <>
          <p className="mute">{count} {o.entries.length + o.rules.length === 1 ? "points" : "point"} at an account that was removed, so {o.entries.length + o.rules.length === 1 ? "it counts" : "they count"} as "Other". Move them all to one account.</p>
          <div className="card fixlist">
            {rows.slice(0, SHOWN).map((x) => (
              <div key={x.key} className="row static item">
                <span className="main"><span className="l1">{x.what}</span><span className="l2 mute">{x.sub}</span></span>
                <span className="money">{x.amount}</span>
              </div>
            ))}
          </div>
          {rows.length > SHOWN && <p className="mute small">and {rows.length - SHOWN} more</p>}
          {live.length ? (
            <label className="field"><b>Move to</b>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {!to && <option value="" disabled>Pick an account</option>}
                <AccountOptions accounts={live} />
              </select></label>
          ) : <p className="mute small">Add an account in Settings first.</p>}
          {error && <p className="err" role="alert">{error}</p>}
          <div className="actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn" disabled={!to} onClick={() => void move()}>{to ? `Move all to ${live.find((a) => a.id === to)?.name}` : "Move all"}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
