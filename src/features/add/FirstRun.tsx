import { useEffect, useState } from "react";
import { list } from "../../data/collections";
import { loadAllEntries } from "../../data/months";
import { CheckIcon } from "../../ui/icons";
import { useLedger } from "../../ui/Ledger";
import { useSync } from "../../ui/Sync";
import { firstRun, loadDismissed, saveDismissed } from "./firstRunState";

/**
 * A first run: one card above the Add form with what to set up, each a way there. It goes once all three
 * are done or it is hidden, and never comes back (per device).
 */
export function FirstRun({ onAccount, onSync, onSalary }: { onAccount: () => void; onSync: () => void; onSalary: () => void }) {
  const { store, rev } = useLedger();
  const { config } = useSync();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [state, setState] = useState<{ accounts: number; salary: boolean }>();

  useEffect(() => {
    if (dismissed) return;
    let stale = false;
    (async () => {
      const [accounts, rules, entries] = await Promise.all([list(store, "accounts"), list(store, "rules"), loadAllEntries(store)]);
      const salary = rules.some((r) => r.type === "income") || entries.some((e) => !e.deleted && e.kind === "income" && e.category === "Salary") // the rule income.ts uses for a salary entry;
      if (!stale) setState({ accounts: accounts.length, salary });
    })();
    return () => { stale = true; };
  }, [store, rev, dismissed]);

  if (!state) return null;
  const f = firstRun({ ...state, synced: !!config, dismissed });
  if (!f.show) return null;
  const item = (done: boolean, label: string, go: () => void) => (
    <li className={done ? "done" : ""}>
      <i className="tick" aria-hidden="true">{done && <CheckIcon />}</i>
      {done ? <span>{label}</span> : <button type="button" className="link" onClick={go}>{label}</button>}
      {done && <span className="visually-hidden">, done</span>}
    </li>
  );
  return (
    <section className="health firstrun" aria-labelledby="firstrun-title">
      <div className="health-head"><b id="firstrun-title">Getting started</b><button type="button" className="link r" onClick={() => { saveDismissed(); setDismissed(true); }}>Hide</button></div>
      <ul className="checklist">
        {item(f.account, "Name an account", onAccount)}
        {item(f.sync, "Set up sync", onSync)}
        {item(f.salary, "Add a salary", onSalary)}
      </ul>
    </section>
  );
}
