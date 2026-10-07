export type SyncState = "synced" | "syncing" | "offline" | "needs-sync";

const LABEL: Record<SyncState, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
  "needs-sync": "Needs sync",
};

export function Pill({ state }: { state: SyncState }) {
  return (
    <span className={`pill ${state}`}>
      <i />
      {LABEL[state]}
    </span>
  );
}
