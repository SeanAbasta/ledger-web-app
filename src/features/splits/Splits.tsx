import { useEffect, useMemo, useState } from "react";
import { list } from "../../data/collections";
import { nonZero, personLines, statementOf, sumBy, type Line } from "../../data/balances";
import { labelShort, today } from "../../data/dates";
import { addEntry, loadAllEntries } from "../../data/months";
import { formatMinor, parseMinor } from "../../data/money";
import { ledgerItems } from "../../data/rules";
import { isCard, type Account, type Person, type Rule } from "../../data/schema";
import { Empty } from "../../ui/Empty";
import { PeopleIcon } from "../../ui/icons";
import { Sheet } from "../../ui/Sheet";
import { MoneyInput } from "../../ui/MoneyInput";
import { Segmented } from "../../ui/Segmented";
import { useLedger } from "../../ui/Ledger";
import { modeLabel } from "../../ui/splitLabels";
import { copyImage, downloadImage, renderStatement } from "./snapshot";
import { partCheck } from "./settle";

interface Row {
  person: Person;
  lines: Line[];
}

const phrase = (name: string, amt: number) => (amt > 0 ? `${name} owes you` : `You owe ${name}`);

export function Splits({ initialPerson }: { initialPerson?: string } = {}) {
  const { store, rev, changed } = useLedger();
  const [rows, setRows] = useState<Row[]>([]);
  // Nothing is shown until the first load, so the empty state never flashes over a list that is coming.
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState<string | undefined>(initialPerson);
  const [settle, setSettle] = useState<Row>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [acct, setAcct] = useState("");
  // Settle up: All of it (as before) or Part of it, with the amount typed.
  const [howMuch, setHowMuch] = useState<"All of it" | "Part of it">("All of it");
  const [part, setPart] = useState("");
  const [snap, setSnap] = useState<{ blob: Blob; url: string; name: string; note?: string }>();

  useEffect(() => {
    (async () => {
      const [people, rules, entries] = await Promise.all([list(store, "people"), list(store, "rules") as Promise<Rule[]>, loadAllEntries(store)]);
      const items = ledgerItems(entries, rules, "0000-01-01", today());
      const rs = people.map((person) => ({ person, lines: personLines(person.id, items) })).filter((r) => r.lines.length);
      setRows(rs);
      setLoaded(true);
      setAccounts((await list(store, "accounts")).filter((a) => !isCard(a))); // settling up never goes to a card
      setSel((s) => (s && rs.some((r) => r.person.id === s) ? s : rs[0]?.person.id));
    })();
  }, [store, rev]);

  useEffect(() => () => { if (snap) URL.revokeObjectURL(snap.url); }, [snap]);

  const current = rows.find((r) => r.person.id === sel);
  // Folds only at a fully settled point, so after a part payment the unpaid lines stay in view.
  const st = useMemo(() => (current ? statementOf(current.lines, { settledOnly: true }) : undefined), [current]);
  // The balance after each line, per currency, starting from the carried balance.
  const running = useMemo(() => {
    if (!st) return [];
    const run: Record<string, number> = { ...st.earlier };
    return st.lines.map((l) => (run[l.currency] = (run[l.currency] ?? 0) + l.amount));
  }, [st]);

  async function makeSnapshot(r: Row) {
    const s = statementOf(r.lines, { settledOnly: true });
    const blob = await renderStatement({ name: r.person.name, asOf: today(), earlier: nonZero(s.earlier), lines: s.lines, net: nonZero(s.net) });
    setSnap({ blob, url: URL.createObjectURL(blob), name: r.person.name });
  }

  // All of it: one settlement per currency, bringing each to zero. Part of it (one currency open): the typed amount.
  async function record(r: Row, partMinor?: number) {
    for (const [cur, amt] of nonZero(sumBy(r.lines))) {
      await addEntry(store, {
        kind: "settlement",
        date: today(),
        amount: partMinor ?? Math.abs(amt),
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

  if (!loaded) return null;
  if (!rows.length) return <Empty icon={<PeopleIcon />} title="No one owes anyone yet" note="Turn on Split when you add an expense and balances appear here." />;

  return (
    <>
      <div className="card">
        {rows.map((r) => {
          const net = nonZero(sumBy(r.lines));
          return (
            <div key={r.person.id} className={`row static person ${r.person.id === sel ? "sel" : ""}`}>
              <button className="who" aria-pressed={r.person.id === sel} onClick={() => setSel(r.person.id)}>
                <b>{r.person.name}</b>
                <span className="mute">{net.length ? net.map(([c, a]) => `${phrase(r.person.name, a).replace(r.person.name, "").trim()} ${formatMinor(Math.abs(a), c)}`).join(" · ") : "Settled"}</span>
              </button>
              {/* The balance as a figure, the Ledger's way: owed to you green with a plus, what you owe plain. The line above says it in words. */}
              {net.length > 0 && <span className="pfig" aria-hidden="true">{net.map(([c, a]) => <span key={c} className={a > 0 ? "pos" : ""}>{a > 0 ? "+" : ""}{formatMinor(Math.abs(a), c)}</span>)}</span>}
              <span className="acts">
                <button className="btn ghost sm" onClick={() => void makeSnapshot(r)}>Snapshot</button>
                <button className="btn sm" disabled={!net.length} onClick={() => { setHowMuch("All of it"); setPart(""); setSettle(r); }}>Settle up</button>
              </span>
            </div>
          );
        })}
      </div>

      {current && st && (
        <>
          <div className="grp" role="heading" aria-level={2}>{current.person.name}</div>
          <div className="card">
            {nonZero(st.earlier).map(([c, a]) => (
              <div key={c} className="row static"><span className="mute">Earlier balance</span><span className="mute num">{a > 0 ? "+" : ""}{formatMinor(Math.abs(a), c)}</span></div>
            ))}
            {st.lines.length === 0 && !nonZero(st.earlier).length && <div className="row static"><span className="mute">Nothing since last settled</span></div>}
            {st.lines.map((l, i) => (
              <div key={l.id} className="row static">
                <span>{labelShort(l.date)} &nbsp;{l.label}{l.total !== undefined && <span className="mute small"> of {formatMinor(l.total, l.currency)}</span>}{l.mode && <span className="tag">{modeLabel(l.mode)}</span>}</span>
                {/* A part payment reads "Paid" with its sign; under each amount, the balance after it. */}
                <span className="num stmt">
                  {l.settlement
                    ? <span className="mute">{l.amount < 0 ? "\u2212" : "+"}{formatMinor(Math.abs(l.amount), l.currency)}</span>
                    : <span className={l.amount > 0 ? "pos" : ""}>{l.amount > 0 ? "+" : ""}{formatMinor(Math.abs(l.amount), l.currency)}</span>}
                  <span className="run" aria-label={`balance after, ${formatMinor(Math.abs(running[i] ?? 0), l.currency)}`}>{formatMinor(Math.abs(running[i] ?? 0), l.currency)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {settle && (() => {
        const open = nonZero(sumBy(settle.lines));
        const [cur, bal] = open[0]!;
        const name = settle.person.name;
        // Part of it is offered when one currency is open; otherwise All of it per currency, as before.
        const canPart = open.length === 1;
        const partly = canPart && howMuch === "Part of it";
        const typed = parseMinor(part, cur);
        const check = partly ? partCheck(bal, part.trim() ? typed : null, cur, name) : undefined;
        const ok = !partly || (check && "remaining" in check);
        return (
          <Sheet locked onClose={() => setSettle(undefined)}>
            <h3>Settle up with {name}</h3>
            {canPart && <div className="settlehow"><Segmented label="How much" value={howMuch} options={["All of it", "Part of it"] as const} onChange={setHowMuch} /></div>}
            {partly ? (
              <>
                <label className="field"><b>{bal > 0 ? `${name} paid` : "You paid"}</b><MoneyInput aria-label={bal > 0 ? `${name} paid` : "You paid"} value={part} onChange={setPart} currency={cur} /></label>
                {accounts.length > 0 && (
                  <label className="field"><b>{bal > 0 ? "Paid into" : "Paid from"}</b>
                    <select value={acct} onChange={(e) => setAcct(e.target.value)}><option value="">{accounts[0]!.name}</option>{accounts.slice(1).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                )}
                <div className="pv" aria-live="polite">{part.trim() && check ? ("error" in check ? <p className="err">{check.error}</p> : <p>{check.line}</p>) : <p className="mute">{bal > 0 ? `${name} owes you ${formatMinor(bal, cur)}` : `You owe ${name} ${formatMinor(-bal, cur)}`}</p>}</div>
              </>
            ) : (
              <>
                {open.map(([c, a]) => (
                  <p key={c}>{a > 0 ? `${name} pays you` : `You pay ${name}`} <b>{formatMinor(Math.abs(a), c)}</b></p>
                ))}
                {accounts.length > 0 && (
                  <label className="field"><b>{bal > 0 ? "Paid into" : "Paid from"}</b>
                    <select value={acct} onChange={(e) => setAcct(e.target.value)}><option value="">{accounts[0]!.name}</option>{accounts.slice(1).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                )}
                <p className="mute small">Records a payment today and brings the balance to zero.</p>
              </>
            )}
            <div className="actions">
              <button className="btn ghost" onClick={() => setSettle(undefined)}>Cancel</button>
              <button className="btn" disabled={!ok} onClick={() => void record(settle, partly && typed ? typed : undefined)}>
                {partly ? (typed && ok ? `Record ${formatMinor(typed, cur)}` : "Record") : open.length === 1 ? `Record ${formatMinor(Math.abs(bal), cur)}` : "Record"}
              </button>
            </div>
          </Sheet>
        );
      })()}

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
