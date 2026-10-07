import { useEffect, useMemo, useState } from "react";
import { list } from "../../data/collections";
import { nonZero, personLines, statementOf, sumBy, type Line } from "../../data/balances";
import { labelShort, today } from "../../data/dates";
import { addEntry, loadAllEntries } from "../../data/months";
import { formatMinor } from "../../data/money";
import { ledgerItems } from "../../data/rules";
import type { Account, Person, Rule } from "../../data/schema";
import { Sheet } from "../../ui/Sheet";
import { useLedger } from "../../ui/Ledger";
import { copyImage, downloadImage, renderStatement } from "./snapshot";

interface Row {
  person: Person;
  lines: Line[];
}

const phrase = (name: string, amt: number) => (amt > 0 ? `${name} owes you` : `You owe ${name}`);

export function Splits() {
  const { store, rev, changed } = useLedger();
  const [rows, setRows] = useState<Row[]>([]);
  const [sel, setSel] = useState<string>();
  const [settle, setSettle] = useState<Row>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [acct, setAcct] = useState("");
  const [snap, setSnap] = useState<{ blob: Blob; url: string; name: string; note?: string }>();

  useEffect(() => {
    (async () => {
      const [people, rules, entries] = await Promise.all([list(store, "people"), list(store, "rules") as Promise<Rule[]>, loadAllEntries(store)]);
      const items = ledgerItems(entries, rules, "0000-01-01", today());
      const rs = people.map((person) => ({ person, lines: personLines(person.id, items) })).filter((r) => r.lines.length);
      setRows(rs);
      setAccounts(await list(store, "accounts"));
      setSel((s) => (s && rs.some((r) => r.person.id === s) ? s : rs[0]?.person.id));
    })();
  }, [store, rev]);

  useEffect(() => () => { if (snap) URL.revokeObjectURL(snap.url); }, [snap]);

  const current = rows.find((r) => r.person.id === sel);
  const st = useMemo(() => (current ? statementOf(current.lines) : undefined), [current]);

  async function makeSnapshot(r: Row) {
    const s = statementOf(r.lines);
    const blob = await renderStatement({ name: r.person.name, asOf: today(), earlier: nonZero(s.earlier), lines: s.lines, net: nonZero(s.net) });
    setSnap({ blob, url: URL.createObjectURL(blob), name: r.person.name });
  }

  async function record(r: Row) {
    for (const [cur, amt] of nonZero(sumBy(r.lines))) {
      await addEntry(store, {
        kind: "settlement",
        date: today(),
        amount: Math.abs(amt),
        currency: cur,
        category: "Settlement",
        note: amt > 0 ? `${r.person.name} paid you` : `You paid ${r.person.name}`,
        personId: r.person.id,
        direction: amt > 0 ? "in" : "out",
        accountId: acct || accounts[0]?.id,
      });
    }
    setSettle(undefined);
    changed();
  }

  if (!rows.length) return <p className="mute empty">No splits yet</p>;

  return (
    <>
      <div className="card">
        {rows.map((r) => {
          const net = nonZero(sumBy(r.lines));
          return (
            <div key={r.person.id} className={`row static ${r.person.id === sel ? "sel" : ""}`}>
              <button className="who" onClick={() => setSel(r.person.id)}>
                <b>{r.person.name}</b>
                <span className="mute">{net.length ? net.map(([c, a]) => `${phrase(r.person.name, a).replace(r.person.name, "").trim()} ${formatMinor(Math.abs(a), c)}`).join(" · ") : "Settled"}</span>
              </button>
              <span className="acts">
                <button className="btn ghost sm" onClick={() => void makeSnapshot(r)}>Snapshot</button>
                <button className="btn sm" disabled={!net.length} onClick={() => setSettle(r)}>Settle</button>
              </span>
            </div>
          );
        })}
      </div>

      {current && st && (
        <>
          <div className="grp">{current.person.name}</div>
          <div className="card">
            {nonZero(st.earlier).map(([c, a]) => (
              <div key={c} className="row static"><span className="mute">Earlier balance</span><span className="mute">{formatMinor(a, c)}</span></div>
            ))}
            {st.lines.length === 0 && !nonZero(st.earlier).length && <div className="row static"><span className="mute">Nothing since last settled</span></div>}
            {st.lines.map((l) => (
              <div key={l.id} className="row static">
                <span>{labelShort(l.date)} &nbsp;{l.label}{l.mode && <span className="tag">{l.mode === "they-owe" ? "They owe" : l.mode === "i-owe" ? "I owe" : l.mode === "half" ? "50/50" : "Custom"}</span>}</span>
                <span className={l.amount < 0 ? "pos" : ""}>{formatMinor(l.amount, l.currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {settle && (
        <Sheet onClose={() => setSettle(undefined)}>
          <h3>Settle up with {settle.person.name}</h3>
          {nonZero(sumBy(settle.lines)).map(([c, a]) => (
            <p key={c}>{a > 0 ? `${settle.person.name} pays you` : `You pay ${settle.person.name}`} <b>{formatMinor(Math.abs(a), c)}</b></p>
          ))}
          {accounts.length > 0 && (
            <label className="field"><b>{nonZero(sumBy(settle.lines))[0]![1] > 0 ? "Paid into" : "Paid from"}</b>
              <select value={acct} onChange={(e) => setAcct(e.target.value)}><option value="">{accounts[0]!.name}</option>{accounts.slice(1).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          )}
          <p className="mute small">Records a payment today and brings the balance to zero.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setSettle(undefined)}>Cancel</button>
            <button className="btn" onClick={() => void record(settle)}>Record</button>
          </div>
        </Sheet>
      )}

      {snap && (
        <Sheet onClose={() => setSnap(undefined)}>
          <h3>{snap.name}</h3>
          <img className="snap" src={snap.url} alt={`Statement for ${snap.name}`} />
          {snap.note && <p className="mute small">{snap.note}</p>}
          <div className="actions">
            <button className="btn ghost" onClick={() => downloadImage(snap.blob, `ledger-${snap.name.toLowerCase().replace(/\W+/g, "-")}.png`)}>Save</button>
            <button className="btn" onClick={async () => setSnap({ ...snap, note: (await copyImage(snap.blob)) ? "Copied" : "Copy not supported here, use Save" })}>Copy</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
