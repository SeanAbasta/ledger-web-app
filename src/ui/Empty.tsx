import type { ReactNode } from "react";

/** A friendly empty state: a soft icon, one short line, and an optional second line. */
export function Empty({ icon, title, note }: { icon: ReactNode; title: string; note?: string }) {
  return (
    <div className="emptystate">
      <span className="emptyicon">{icon}</span>
      <p className="emptytitle">{title}</p>
      {note && <p className="mute small">{note}</p>}
    </div>
  );
}
