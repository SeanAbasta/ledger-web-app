import { useState } from "react";
import { pillOf } from "../../ui/Pill";
import { Sheet } from "../../ui/Sheet";
import { useSync } from "../../ui/Sync";

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

/** Opened from the status pill: sync now, and the "safe to close" confirmation. */
export function SyncSheet({ onClose, onSetup }: { onClose: () => void; onSetup: () => void }) {
  const { engine, status, readOnly, editOffline } = useSync();
  const [result, setResult] = useState<"safe" | "not-safe">();
  const [busy, setBusy] = useState(false);
  const { label } = pillOf(status);

  async function syncNow() {
    setBusy(true);
    setResult(undefined);
    const r = await engine.syncNow();
    setResult(r.safeToClose ? "safe" : "not-safe");
    setBusy(false);
  }

  if (status.state === "unconfigured") {
    return (
      <Sheet onClose={onClose}>
        <h3>Sync is off</h3>
        <p className="mute">Your data stays on this device only. Connect GitHub to keep your Mac and Windows PC in step.</p>
        <div className="actions"><button className="btn" onClick={() => { onClose(); onSetup(); }}>Connect GitHub</button></div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      {result === "safe" && status.state === "synced" ? (
        <div className="center">
          <div className="check">✓</div>
          <h3>Synced. Safe to close.</h3>
          <p className="mute">GitHub and this device match.</p>
        </div>
      ) : (
        <>
          <h3>{label}</h3>
          <p className="mute">{status.message ?? (status.state === "synced" ? "Everything is on GitHub." : "")}</p>
          <p className="mute small">Last synced {fmt(status.lastSynced)}</p>
          {result === "not-safe" && <p className="err" role="alert">Not safe to close yet.</p>}
        </>
      )}
      <div className="actions">
        {status.state === "error" && /token/i.test(status.message ?? "") && <button className="btn ghost" onClick={() => { onClose(); onSetup(); }}>Replace token</button>}
        {status.state === "offline" && readOnly && <button className="btn ghost" onClick={() => { editOffline(); onClose(); }}>Edit offline</button>}
        {(status.state === "offline" || status.state === "error") && <button className="btn ghost" onClick={() => void engine.open()}>Retry</button>}
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" disabled={busy || status.state === "checking"} onClick={() => void syncNow()}>{busy ? "Syncing…" : "Sync now"}</button>
      </div>
    </Sheet>
  );
}
