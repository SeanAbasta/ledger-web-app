import { useSync } from "../../ui/Sync";

/** Blocks the app while we check GitHub on open, and until a conflict is settled. */
export function Gate() {
  const { engine, status } = useSync();

  if (status.state === "checking") {
    return (
      <div className="scrim" role="alertdialog" aria-label="Checking for updates">
        <div className="glasscard sheet center">
          <div className="spinner" />
          <h3>Checking for updates…</h3>
          <p className="mute">Getting the latest from your other device.</p>
        </div>
      </div>
    );
  }

  if (status.state === "conflict") {
    return (
      <div className="scrim" role="alertdialog" aria-label="Two versions">
        <div className="glasscard sheet center">
          <h3>Two versions</h3>
          <p className="mute">This device and GitHub both changed.</p>
          <button className="choice" onClick={() => void engine.resolve("local")}>Keep this device<small>Replace GitHub with what is here</small></button>
          <button className="choice" onClick={() => void engine.resolve("remote")}>Keep remote<small>Replace this device with GitHub</small></button>
          <button className="choice" onClick={() => void engine.resolve("merge")}>Merge<small>Combine by entry, newest edit wins</small></button>
          <p className="mute small">The other version is saved to Downloads first.</p>
        </div>
      </div>
    );
  }
  return null;
}
