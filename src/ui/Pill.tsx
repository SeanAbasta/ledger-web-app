import type { SyncStatus } from "../sync/engine";

export type PillClass = "synced" | "syncing" | "offline" | "needs-sync";

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function pillOf(s: SyncStatus): { cls: PillClass; label: string } {
  switch (s.state) {
    case "synced": return { cls: "synced", label: "Synced" };
    case "syncing": return { cls: "syncing", label: "Syncing…" };
    case "checking": return { cls: "syncing", label: "Checking…" };
    case "needs-sync": return { cls: "needs-sync", label: "Needs sync" };
    case "offline": return { cls: "offline", label: s.lastSynced ? `Offline · synced ${when(s.lastSynced)}` : "Offline" };
    case "conflict": return { cls: "needs-sync", label: "Conflict" };
    case "error": return { cls: "needs-sync", label: /token/i.test(s.message ?? "") ? "Token expired" : "Sync problem" };
    default: return { cls: "offline", label: "Set up sync" };
  }
}

export function Pill({ status, onClick }: { status: SyncStatus; onClick?: () => void }) {
  const { cls, label } = pillOf(status);
  return (
    <button type="button" className={`pill ${cls}`} onClick={onClick} aria-label={`Sync status: ${label}`}>
      <i />
      {label}
    </button>
  );
}
