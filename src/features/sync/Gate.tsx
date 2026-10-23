import { useSync } from "../../ui/Sync";

/** Blocks the app while we check GitHub on open, and until a conflict is settled. */
export function Gate() {
  const { engine, status } = useSync();

  if (status.state === "checking") {
    return (
      <div className="scrim" role="alertdialog" aria-label="Checking for updates">
        <div className="glasscard sheet center gate">
          <div className="spinner" />
          <h3>Checking for updates…</h3>
          <p className="mute">Getting the latest from your other device.</p>
        </div>
      </div>
    );
  }

  if (status.state === "conflict") {
    return (
      <div className="scrim" role="alertdialog" aria-label="Two versions of your ledger">
        <div className="glasscard sheet center gate">
          <h3>Two versions of your ledger</h3>
          {/* The safe thing first, then the choices, Merge recommended. The choices themselves are unchanged. */}
          <p className="mute">Nothing is lost: what you do not keep is saved to Downloads first. Merge saves both versions.</p>
          <button className="choice rec" onClick={() => void engine.resolve("merge")}>Merge, recommended<small>Combine by entry, newest edit wins</small></button>
          <button className="choice" onClick={() => void engine.resolve("local")}>Keep this device<small>Replace GitHub with what is here</small></button>
          <button className="choice" onClick={() => void engine.resolve("remote")}>Keep GitHub's version<small>Replace this device with GitHub</small></button>
        </div>
      </div>
    );
  }
  return null;
}
