import { useEffect, useState } from "react";
import { LedgerStore } from "./data/db";
import { getSettings } from "./data/collections";
import { Pill } from "./ui/Pill";

const NAV = ["Add", "Ledger", "Dashboard", "Splits", "Forecast", "Settings"] as const;

export function App() {
  const [tab, setTab] = useState<(typeof NAV)[number]>("Add");
  const [base, setBase] = useState<string>();

  useEffect(() => {
    LedgerStore.open().then(getSettings).then((s) => setBase(s.baseCurrency));
  }, []);

  return (
    <div className="win">
      <nav className="side">
        <div className="brand">Ledger</div>
        {NAV.map((n) => (
          <button key={n} className={n === tab ? "on" : ""} onClick={() => setTab(n)}>
            {n}
          </button>
        ))}
      </nav>
      <main>
        <header className="bar">
          <h1>{tab}</h1>
          <Pill state="synced" />
        </header>
        <section className="body">
          <p className="mute">Local store ready{base ? ` (base ${base})` : ""}. Screens come next.</p>
        </section>
      </main>
    </div>
  );
}
