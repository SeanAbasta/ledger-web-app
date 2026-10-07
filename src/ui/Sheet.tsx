import type { ReactNode } from "react";
import { useSync } from "./Sync";

/** `locked` disables every control inside while the app is read-only (offline, not overridden). */
export function Sheet({ children, onClose, locked }: { children: ReactNode; onClose: () => void; locked?: boolean }) {
  const { readOnly } = useSync();
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glasscard sheet">
        <fieldset className="plain" disabled={!!locked && readOnly}>{children}</fieldset>
      </div>
    </div>
  );
}
