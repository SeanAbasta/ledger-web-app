import type { ReactNode } from "react";

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glasscard sheet">{children}</div>
    </div>
  );
}
