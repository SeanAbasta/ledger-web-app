import { useState } from "react";
import { AddForm, type SavedNote } from "./features/add/AddForm";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Forecast } from "./features/forecast/Forecast";
import { Ledger } from "./features/ledger/Ledger";
import { Settings } from "./features/settings/Settings";
import { Splits } from "./features/splits/Splits";
import { Gate } from "./features/sync/Gate";
import { SetupSheet } from "./features/sync/SetupSheet";
import { SyncSheet } from "./features/sync/SyncSheet";
import { LedgerProvider } from "./ui/Ledger";
import { Pill } from "./ui/Pill";
import { SyncProvider, useSync } from "./ui/Sync";

const NAV = ["Add", "Ledger", "Dashboard", "Splits", "Forecast", "Settings"] as const;
export type Tab = (typeof NAV)[number];

/** The screens that are all about editing are locked as a whole while offline and read-only. */
const EDIT_TABS: Tab[] = ["Add", "Forecast"]; // Settings locks its own edit controls so Export still works offline

function Screen({ tab, go, setup, focusPerson, openPerson, saved, onSaved, focusCard, openCard }: { tab: Tab; go: (t: Tab) => void; setup: () => void; focusPerson?: string; openPerson: (id: string) => void; saved?: SavedNote; onSaved: (s?: SavedNote) => void; focusCard?: string; openCard: (id: string) => void }) {
  if (tab === "Add") return <div className="glasscard addcard"><AddForm onDone={(s) => { onSaved(s); go("Ledger"); }} /></div>;
  if (tab === "Ledger") return <Ledger key={saved?.date ?? ""} initialDate={saved?.date} notice={saved?.message} />;
  if (tab === "Dashboard") return <Dashboard onOpenPerson={openPerson} onOpenLedger={(date) => { onSaved({ date, message: "" }); go("Ledger"); }} onOpenCardSettings={openCard} />;
  if (tab === "Splits") return <Splits key={focusPerson ?? ""} initialPerson={focusPerson} />;
  if (tab === "Forecast") return <Forecast />;
  return <Settings onSetup={setup} focusCard={focusCard} />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("Add");
  const [sheet, setSheet] = useState<"sync" | "setup">();
  // Set when the Dashboard opens a person, so Splits starts on them.
  const [focusPerson, setFocusPerson] = useState<string>();
  // Set when the Add form saves, so the Ledger opens where the new item is and says it was saved.
  const [saved, setSaved] = useState<SavedNote>();
  // Set when Reconcile opens a card's settings ("Set as Owed at start"), so Settings scrolls to it.
  const [focusCard, setFocusCard] = useState<string>();
  const { status, readOnly, editOffline, engine } = useSync();
  const locked = readOnly && EDIT_TABS.includes(tab);

  return (
    <div className="win">
      <nav className="side">
        <div className="brand">Ledger</div>
        {NAV.map((n) => (
          <button key={n} className={n === tab ? "on" : ""} onClick={() => { setFocusPerson(undefined); setSaved(undefined); setFocusCard(undefined); setTab(n); }}>{n}</button>
        ))}
      </nav>
      <main>
        <header className="bar">
          <h1>{tab}</h1>
          <Pill status={status} onClick={() => setSheet("sync")} />
        </header>
        {readOnly && (
          <div className="banner">
            Offline, read-only so the other device's data stays safe.
            <button className="btn ghost sm" onClick={editOffline}>Edit offline</button>
            <button className="btn ghost sm" onClick={() => void engine.open()}>Retry</button>
          </div>
        )}
        <section className="body">
          <fieldset className="plain" disabled={locked}>
            {/* Keyed on the tab so the new screen fades in (screens already remount on a tab change). */}
            <div key={tab} className="tabfade">
            <Screen tab={tab} go={setTab} setup={() => setSheet("setup")} focusPerson={focusPerson} openPerson={(id) => { setFocusPerson(id); setTab("Splits"); }} saved={saved} onSaved={setSaved} focusCard={focusCard} openCard={(id) => { setFocusCard(id); setTab("Settings"); }} />
            </div>
          </fieldset>
        </section>
      </main>
      <Gate />
      {sheet === "sync" && <SyncSheet onClose={() => setSheet(undefined)} onSetup={() => setSheet("setup")} />}
      {sheet === "setup" && <SetupSheet onClose={() => setSheet(undefined)} />}
    </div>
  );
}

export function App() {
  return (
    <LedgerProvider>
      <SyncProvider>
        <Shell />
      </SyncProvider>
    </LedgerProvider>
  );
}
