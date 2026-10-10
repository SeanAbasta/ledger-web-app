import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useSync } from "./Sync";

const OUT_MS = 200; // matches the closing transition in tokens.css
const DRAG_CLOSE_PX = 80;

/**
 * Modal sheet. It slides up (a bottom sheet on phones, a centred box that rises on wider screens) and
 * slides away when dismissed by tapping outside or dragging the handle down. With Reduce Motion it
 * only fades. A sheet the app closes itself (after a save) just disappears.
 * `locked` disables every control inside while the app is read-only (offline, not overridden).
 */
export function Sheet({ children, onClose, locked }: { children: ReactNode; onClose: () => void; locked?: boolean }) {
  const { readOnly } = useSync();
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function dismiss() {
    if (closing) return;
    if (box.current) box.current.style.transform = ""; // the class transition takes over from where a drag left it
    setClosing(true);
    timer.current = window.setTimeout(onClose, OUT_MS);
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (closing || !box.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, dy: 0 };
    box.current.style.transition = "none";
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !box.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    box.current.style.transform = `translateY(${drag.current.dy}px)`;
  }
  function up() {
    const d = drag.current;
    drag.current = undefined;
    if (!d || !box.current) return;
    box.current.style.transition = "";
    if (d.dy > DRAG_CLOSE_PX) dismiss();
    else box.current.style.transform = ""; // springs back through the normal transition
  }

  return (
    <div className={closing ? "scrim drawer closing" : "scrim drawer"} onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div ref={box} className="glasscard sheet" role="dialog" aria-modal="true">
        <div className="grab" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i /></div>
        <fieldset className="plain" disabled={!!locked && readOnly}>{children}</fieldset>
      </div>
    </div>
  );
}
