import type { ReactNode } from "react";

/** A friendly empty state: a soft icon, one short line, an optional second line and an optional way forward. */
export function Empty({ icon, title, note, action }: { icon: ReactNode; title: string; note?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="emptystate">
      <span className="emptyicon">{icon}</span>
      <p className="emptytitle">{title}</p>
      {note && <p className="mute small">{note}</p>}
      {action && <button type="button" className="btn ghost sm emptyaction" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
