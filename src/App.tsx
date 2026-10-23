import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from "react";
import { AddForm, type SavedNote } from "./features/add/AddForm";
import type { Draft } from "./features/add/draft";
import { draftOf, keep, noUnsaved, resume, type Unsaved } from "./features/add/unsaved";
import { FirstRun } from "./features/add/FirstRun";
import { IncomeForm } from "./features/add/IncomeForm";
import { TransferForm } from "./features/ledger/TransferForm";
import { Dashboard } from "./features/dashboard/Dashboard";
import { ComingUp } from "./features/comingUp/ComingUp";
import { Ledger, type View as LedgerView } from "./features/ledger/Ledger";
import { Settings, type Page as SettingsPage } from "./features/settings/Settings";
import { Splits } from "./features/splits/Splits";
import { Gate } from "./features/sync/Gate";
import { SetupSheet } from "./features/sync/SetupSheet";
import { SyncSheet } from "./features/sync/SyncSheet";
import { LedgerProvider, useLedger } from "./ui/Ledger";
import { healthOf } from "./features/settings/health";
import { daysLeft } from "./sync/config";
import { AddIcon, CalendarIcon, DashboardIcon, LedgerIcon, PeopleIcon, SettingsIcon } from "./ui/icons";
import { Pill } from "./ui/Pill";
import { Segmented } from "./ui/Segmented";
import { SyncProvider, useSync } from "./ui/Sync";
import { ToastProvider, useToast } from "./ui/Toast";
import { useShortcuts } from "./ui/shortcuts";
import { LeaveGuardRef, type LeaveGuard } from "./ui/leaveGuard";

// Rooms are named for the question they answer. People (was Splits) and Coming up (was Forecast) keep their slots.
const NAV = ["Add", "Ledger", "Dashboard", "People", "Coming up", "Settings"] as const;
export type Tab = (typeof NAV)[number];
/** The tab bar (phones) and sidebar (computers): five rooms. Settings sits behind the gear in the header. */
const ROOMS = NAV.filter((n): n is Exclude<Tab, "Settings"> => n !== "Settings");

/** One icon per room: the phone tab bar and the sidebar show the same ones. */
const ICON: Record<Exclude<Tab, "Settings">, () => ReactElement> = { Add: AddIcon, Ledger: LedgerIcon, Dashboard: DashboardIcon, People: PeopleIcon, "Coming up": CalendarIcon };

/** The screens that are all about editing are locked as a whole while offline and read-only. */
// Coming up locks its own Salary block and plan sheets, so its views and rows still open offline; Settings
// locks its own edit controls so Export still works offline.
const EDIT_TABS: Tab[] = ["Add"];

/** Lists read better in a narrower column on big screens; Dashboard and Coming up use the full one. */
const READING_TABS: Tab[] = ["Add", "Ledger", "People", "Settings"];

/** What Undo of Save put back: the values, a counter that remounts the forms, and whether a form has taken them. */
type Refill = { draft: Draft; n: number; taken?: boolean };

const ADD_KINDS = ["Expense", "Income", "Transfer"] as const;
type AddKind = (typeof ADD_KINDS)[number];

/**
 * The Add tab: one form at a time, picked at the top. Each is its own form (AddForm is the expense form).
 * After a save it stays here and the Undo toast names what was saved, so several can be logged in a row;
 * only a plan that starts later opens the Ledger at once (`open`). Undo takes the item back out and
 * returns its values to the form (`refill`, also after a tab change).
 */
function AddTab({ onView, onOpenSettings, onSetup, onSalary, refill, onRefill, onTaken, unsaved }: { onView: (s: SavedNote) => void; onOpenSettings: () => void; onSetup: () => void; onSalary: () => void; refill?: Refill; onRefill: (d: Draft) => void; onTaken: () => void; unsaved: MutableRefObject<Unsaved> }) {
  // Undo puts its values back once. Otherwise Add opens with what was typed and not saved when it was left.
  const [pending, setPending] = useState(() => (refill && !refill.taken ? refill.draft : resume(unsaved.current)));
  useEffect(() => {
    if (!pending) return;
    onTaken();
    setPending(undefined);
  }, []);
  const [kind, setKind] = useState<AddKind>(pending?.kind ?? "Expense");
  const { show } = useToast();
  const done = (s?: SavedNote) => {
    if (!s) return;
    // Nothing stays focused after a save (Return in a field would keep the phone keyboard up).
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    if (s.open) onView(s);
    const { undo, draft } = s;
    show({ message: s.toast ?? s.message, sub: s.sub, undo: undo && draft ? async () => { await undo(); onRefill(draft); } : undefined });
  };
  const draft = pending?.kind === kind ? pending : draftOf(unsaved.current, kind);
  return (
    <>
    <FirstRun onAccount={onOpenSettings} onSync={onSetup} onSalary={onSalary} />
    <div className="glasscard addcard">
      <div className="addkind"><Segmented label="Kind of entry" value={kind} options={ADD_KINDS} onChange={setKind} /></div>
      {kind === "Expense" ? <AddForm key={`e${refill?.n ?? 0}`} onDone={done} draft={draft?.kind === "Expense" ? draft.fields : undefined} onDraft={(f) => { unsaved.current = keep(unsaved.current, { kind: "Expense", fields: f }); }} />
        : kind === "Income" ? <IncomeForm key={`i${refill?.n ?? 0}`} onDone={done} draft={draft?.kind === "Income" ? draft.fields : undefined} onDraft={(f) => { unsaved.current = keep(unsaved.current, { kind: "Income", fields: f }); }} />
        : <TransferForm key={`t${refill?.n ?? 0}`} onDone={done} onOpenSettings={onOpenSettings} draft={draft?.kind === "Transfer" ? draft.fields : undefined} onDraft={(f) => { unsaved.current = keep(unsaved.current, { kind: "Transfer", fields: f }); }} />}
    </div>
    </>
  );
}

function Screen({ refill, onRefill, onTaken, unsaved, tab, go, setup, focusPerson, openPerson, saved, onSaved, ledgerView, setLedgerView, focusCard, openCard, focusTile, openTile, settingsPage, openSettings }: { refill?: Refill; onRefill: (d: Draft) => void; onTaken: () => void; unsaved: MutableRefObject<Unsaved>; tab: Tab; go: (t: Tab) => void; setup: () => void; focusPerson?: string; openPerson: (id: string) => void; saved?: SavedNote; onSaved: (s?: SavedNote) => void; ledgerView?: LedgerView; setLedgerView: (v?: LedgerView) => void; focusCard?: string; openCard: (id: string) => void; focusTile?: string; openTile: (id: string) => void; settingsPage?: SettingsPage; openSettings: (p: SettingsPage) => void }) {
  if (tab === "Add") return <AddTab key={refill?.n ?? 0} refill={refill} onRefill={onRefill} onTaken={onTaken} unsaved={unsaved} onView={(s) => { onSaved(s); go("Ledger"); }} onOpenSettings={() => openSettings("accounts")} onSetup={setup} onSalary={() => { try { localStorage.setItem("ledger.comingUp", "12 months"); } catch { /* storage blocked */ } go("Coming up"); }} />;
  if (tab === "Ledger") return <Ledger key={`${saved?.date ?? ""}/${ledgerView ?? ""}`} initialDate={saved?.date} initialView={ledgerView} notice={saved?.message} onAdd={() => go("Add")} onComingUp={() => go("Coming up")} />;
  if (tab === "Dashboard") return <Dashboard onOpenPerson={openPerson} onOpenLedger={(date) => { onSaved({ date, message: "" }); setLedgerView(undefined); go("Ledger"); }} onOpenDay={(date) => { onSaved({ date, message: "" }); setLedgerView("Day"); go("Ledger"); }} onOpenCardSettings={openCard} onAdd={() => go("Add")} onComingUp={() => go("Coming up")} focusTile={focusTile} />;
  if (tab === "People") return <Splits key={focusPerson ?? ""} initialPerson={focusPerson} />;
  if (tab === "Coming up") return <ComingUp onOpenCard={openTile} onOpenPerson={openPerson} onOpenLedger={(date) => { onSaved({ date, message: "" }); setLedgerView(undefined); go("Ledger"); }} />;
  return <Settings onSetup={setup} focusCard={focusCard} initialPage={settingsPage} />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("Add");
  const [sheet, setSheet] = useState<"sync" | "setup">();
  // Set when the Dashboard opens a person, so People starts on them.
  const [focusPerson, setFocusPerson] = useState<string>();
  // Set when the Add form saves, so the Ledger opens where the new item is and says it was saved.
  const [saved, setSaved] = useState<SavedNote>();
  // Undo of a save: the values go back into the Add form (the toast can outlive the Add tab).
  const [refill, setRefill] = useState<Refill>();
  // What was typed on Add and not saved, kept while another room is open.
  const unsaved = useRef<Unsaved>(noUnsaved());
  // Set when the Dashboard calendar opens one day, so the Ledger starts in Day view.
  const [ledgerView, setLedgerView] = useState<LedgerView>();
  // Set when a Coming up bill opens its card, so the Dashboard scrolls to that card's tile (where Pay is).
  const [focusTile, setFocusTile] = useState<string>();
  // Set when Reconcile opens a card's settings ("Set as Owed at start"), so Settings scrolls to it.
  const [focusCard, setFocusCard] = useState<string>();
  // Set when another screen opens a Settings page directly (the Add tab's transfer hint).
  const [settingsPage, setSettingsPage] = useState<SettingsPage>();
  const { status, readOnly, editOffline, engine, config } = useSync();
  const { store, rev } = useLedger();
  // The gear's dot: the token is expired or expires within 30 days, or nothing is backed up (Data health).
  const [stamps, setStamps] = useState<{ synced?: string; exported?: string }>({});
  useEffect(() => {
    let stale = false;
    void Promise.all([store.getMeta<string>("lastSynced"), store.getMeta<string>("lastExported")]).then(([synced, exported]) => { if (!stale) setStamps({ synced, exported }); });
    return () => { stale = true; };
  }, [store, rev, status.lastSynced]);
  // Computer shortcuts (Off switch in Settings): N opens Add, / searches the Ledger, [ and ] step the period.
  useShortcuts((s, e) => {
    if (s === "new") open("Add");
    else if (s === "search" && tab === "Ledger") { e.preventDefault(); document.querySelector<HTMLInputElement>(".body .search")?.focus(); }
    else if (s === "prev" || s === "next") document.querySelector<HTMLButtonElement>(`.body .nav button[aria-label^="${s === "prev" ? "Previous" : "Next"}"]`)?.click();
  });
  // The phone header draws its hairline only once the page has scrolled.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const attention = healthOf({ connected: !!config, syncState: status.state, tokenError: /token/i.test(status.message ?? ""), lastSynced: status.lastSynced ?? stamps.synced, lastExported: stamps.exported, tokenDays: daysLeft(config), now: new Date() }).attention;
  const locked = readOnly && EDIT_TABS.includes(tab);
  // A tab (or the gear) starts its room fresh: nothing carried over from where another screen sent us.
  // The Ledger's docked pane may hold typed changes: it can ask before a room change drops them.
  const guard = useRef<LeaveGuard | undefined>(undefined);
  const open = (n: Tab) => {
    const go = () => { setFocusPerson(undefined); setSaved(undefined); setLedgerView(undefined); setFocusTile(undefined); setFocusCard(undefined); setSettingsPage(undefined); setTab(n); };
    if (!guard.current?.(go)) go();
  };

  // The sync pill and the gear: in the top bar on computers, in each room's header on phones (CSS shows one).
  const actions = (cls: string) => (
    <span className={cls}>
      <Pill status={status} onClick={() => setSheet("sync")} />
      <button type="button" className={tab === "Settings" ? "gear on" : "gear"} aria-label={attention ? "Settings, needs attention" : "Settings"} aria-current={tab === "Settings" ? "page" : undefined} onClick={() => open("Settings")}><SettingsIcon />{attention && <i className="gear-dot" aria-hidden="true" />}</button>
    </span>
  );

  return (
    <LeaveGuardRef.Provider value={guard}>
    <div className={tab === "Add" ? "win on-add" : "win"}>
      <a className="skiplink" href="#room" onClick={(e) => { e.preventDefault(); document.getElementById("room")?.focus(); }}>Skip to this room</a>
      <nav className="side" aria-label="Rooms">
        <div className="brand">Ledger</div>
        {ROOMS.map((n) => {
          const Icon = ICON[n];
          return (
            <button key={n} className={n === tab ? "on" : ""} aria-current={n === tab ? "page" : undefined} onClick={() => open(n)}>
              <Icon /><span>{n}</span>
            </button>
          );
        })}
        {actions("baracts topacts")}
      </nav>
      <main id="room" tabIndex={-1} className={READING_TABS.includes(tab) ? "reading" : undefined} data-tab={tab}>
        <header className={scrolled ? "bar scrolled" : "bar"}>
          <h1>{tab}</h1>
          {actions("baracts")}
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
            <Screen refill={refill} unsaved={unsaved} onTaken={() => setRefill((r) => (r ? { ...r, taken: true } : r))} onRefill={(draft) => { setRefill((r) => ({ draft, n: (r?.n ?? 0) + 1 })); setTab("Add"); }} tab={tab} go={setTab} setup={() => setSheet("setup")} focusPerson={focusPerson} openPerson={(id) => { setFocusPerson(id); setTab("People"); }} saved={saved} onSaved={setSaved} ledgerView={ledgerView} setLedgerView={setLedgerView} focusTile={focusTile} openTile={(id) => { setFocusTile(id); setTab("Dashboard"); }} focusCard={focusCard} openCard={(id) => { setFocusCard(id); setTab("Settings"); }} settingsPage={settingsPage} openSettings={(p) => { setSettingsPage(p); setTab("Settings"); }} />
            </div>
          </fieldset>
        </section>
      </main>
      <Gate />
      {sheet === "sync" && <SyncSheet onClose={() => setSheet(undefined)} onSetup={() => setSheet("setup")} />}
      {sheet === "setup" && <SetupSheet onClose={() => setSheet(undefined)} />}
    </div>
    </LeaveGuardRef.Provider>
  );
}

export function App() {
  return (
    <LedgerProvider>
      <SyncProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </SyncProvider>
    </LedgerProvider>
  );
}
