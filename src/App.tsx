import { useState, type ReactElement } from "react";
import { AddForm, type SavedNote } from "./features/add/AddForm";
import { IncomeForm } from "./features/add/IncomeForm";
import { TransferForm } from "./features/ledger/TransferForm";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Forecast } from "./features/forecast/Forecast";
import { Ledger } from "./features/ledger/Ledger";
import { Settings, type Page as SettingsPage } from "./features/settings/Settings";
import { Splits } from "./features/splits/Splits";
import { Gate } from "./features/sync/Gate";
import { SetupSheet } from "./features/sync/SetupSheet";
import { SyncSheet } from "./features/sync/SyncSheet";
import { LedgerProvider } from "./ui/Ledger";
import { AddIcon, DashboardIcon, ForecastIcon, LedgerIcon, SettingsIcon, SplitsIcon } from "./ui/icons";
import { Pill } from "./ui/Pill";
import { Segmented } from "./ui/Segmented";
import { SyncProvider, useSync } from "./ui/Sync";

const NAV = ["Add", "Ledger", "Dashboard", "Splits", "Forecast", "Settings"] as const;
export type Tab = (typeof NAV)[number];

/** One icon per tab: the phone tab bar and the sidebar show the same ones. */
const ICON: Record<Tab, () => ReactElement> = { Add: AddIcon, Ledger: LedgerIcon, Dashboard: DashboardIcon, Splits: SplitsIcon, Forecast: ForecastIcon, Settings: SettingsIcon };

/** The screens that are all about editing are locked as a whole while offline and read-only. */
const EDIT_TABS: Tab[] = ["Add", "Forecast"]; // Settings locks its own edit controls so Export still works offline

/** Lists read better in a narrower column on big screens; Dashboard and Forecast use the full one. */
const READING_TABS: Tab[] = ["Add", "Ledger", "Splits", "Settings"];

const ADD_KINDS = ["Expense", "Income", "Transfer"] as const;
type AddKind = (typeof ADD_KINDS)[number];

/**
 * The Add tab: one form at a time, picked at the top. Each is its own form (AddForm is the expense form).
 * After a save it stays here with a "Saved: ..." line and a View button, so several can be logged in a row;
 * only a plan that starts later opens the Ledger at once (`open`).
 */
function AddTab({ onView, onOpenSettings }: { onView: (s: SavedNote) => void; onOpenSettings: () => void }) {
  const [kind, setKind] = useState<AddKind>("Expense");
  const [saved, setSaved] = useState<SavedNote>();
  const done = (s?: SavedNote) => {
    if (!s) return;
    // Nothing stays focused after a save (Return in a field would keep the phone keyboard up).
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (s.open) onView(s);
    else setSaved(s);
  };
  return (
    <div className="glasscard addcard">
      <div className="addkind"><Segmented value={kind} options={ADD_KINDS} onChange={(k) => { setSaved(undefined); setKind(k); }} /></div>
      {saved && (
        <p className="savedline" role="status">{saved.message}. <button type="button" className="link" onClick={() => onView(saved)}>View</button></p>
      )}
      {kind === "Expense" ? <AddForm onDone={done} /> : kind === "Income" ? <IncomeForm onDone={done} /> : <TransferForm onDone={done} onOpenSettings={onOpenSettings} />}
    </div>
  );
}

function Screen({ tab, go, setup, focusPerson, openPerson, saved, onSaved, focusCard, openCard, settingsPage, openSettings }: { tab: Tab; go: (t: Tab) => void; setup: () => void; focusPerson?: string; openPerson: (id: string) => void; saved?: SavedNote; onSaved: (s?: SavedNote) => void; focusCard?: string; openCard: (id: string) => void; settingsPage?: SettingsPage; openSettings: (p: SettingsPage) => void }) {
  if (tab === "Add") return <AddTab onView={(s) => { onSaved(s); go("Ledger"); }} onOpenSettings={() => openSettings("accounts")} />;
  if (tab === "Ledger") return <Ledger key={saved?.date ?? ""} initialDate={saved?.date} notice={saved?.message} onAdd={() => go("Add")} />;
  if (tab === "Dashboard") return <Dashboard onOpenPerson={openPerson} onOpenLedger={(date) => { onSaved({ date, message: "" }); go("Ledger"); }} onOpenCardSettings={openCard} onAdd={() => go("Add")} />;
  if (tab === "Splits") return <Splits key={focusPerson ?? ""} initialPerson={focusPerson} />;
  if (tab === "Forecast") return <Forecast />;
  return <Settings onSetup={setup} focusCard={focusCard} initialPage={settingsPage} />;
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
  // Set when another screen opens a Settings page directly (the Add tab's transfer hint).
  const [settingsPage, setSettingsPage] = useState<SettingsPage>();
  const { status, readOnly, editOffline, engine } = useSync();
  const locked = readOnly && EDIT_TABS.includes(tab);

  return (
    <div className="win">
      <nav className="side">
        <div className="brand">Ledger</div>
        {NAV.map((n) => {
          const Icon = ICON[n];
          return (
            <button key={n} className={n === tab ? "on" : ""} aria-current={n === tab ? "page" : undefined} onClick={() => { setFocusPerson(undefined); setSaved(undefined); setFocusCard(undefined); setSettingsPage(undefined); setTab(n); }}>
              <Icon /><span>{n}</span>
            </button>
          );
        })}
      </nav>
      <main className={READING_TABS.includes(tab) ? "reading" : undefined}>
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
            <Screen tab={tab} go={setTab} setup={() => setSheet("setup")} focusPerson={focusPerson} openPerson={(id) => { setFocusPerson(id); setTab("Splits"); }} saved={saved} onSaved={setSaved} focusCard={focusCard} openCard={(id) => { setFocusCard(id); setTab("Settings"); }} settingsPage={settingsPage} openSettings={(p) => { setSettingsPage(p); setTab("Settings"); }} />
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
