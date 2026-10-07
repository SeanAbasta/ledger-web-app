import { useState } from "react";
import { AddForm } from "./features/add/AddForm";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Splits } from "./features/splits/Splits";
import { Ledger } from "./features/ledger/Ledger";
import { LedgerProvider } from "./ui/Ledger";
import { Pill } from "./ui/Pill";

const NAV = ["Add", "Ledger", "Dashboard", "Splits", "Forecast", "Settings"] as const;
type Tab = (typeof NAV)[number];

function Screen({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  if (tab === "Add") return <div className="glasscard addcard"><AddForm onDone={() => go("Ledger")} /></div>;
  if (tab === "Ledger") return <Ledger />;
  if (tab === "Dashboard") return <Dashboard />;
  if (tab === "Splits") return <Splits />;
  return <p className="mute empty">Coming soon</p>;
}

export function App() {
  const [tab, setTab] = useState<Tab>("Add");
  return (
    <LedgerProvider>
      <div className="win">
        <nav className="side">
          <div className="brand">Ledger</div>
          {NAV.map((n) => (
            <button key={n} className={n === tab ? "on" : ""} onClick={() => setTab(n)}>{n}</button>
          ))}
        </nav>
        <main>
          <header className="bar">
            <h1>{tab}</h1>
            <Pill state="synced" />
          </header>
          <section className="body"><Screen tab={tab} go={setTab} /></section>
        </main>
      </div>
    </LedgerProvider>
  );
}
