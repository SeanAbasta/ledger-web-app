import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { dropSheet, isTopSheet, pushSheet, type SheetStack } from "./sheetStack";
import { CloseIcon } from "./icons";
import { useSync } from "./Sync";

const OUT_MS = 200; // matches the closing transition in tokens.css
const DRAG_CLOSE_PX = 80;

// Every open sheet, oldest first: Escape closes only the top one.
let open: SheetStack = [];

/**
 * Modal sheet. It slides up (a bottom sheet on phones, a centred box that rises on wider screens) and
 * slides away when dismissed by tapping outside or dragging the handle down. With Reduce Motion it
 * only fades. A sheet the app closes itself (after a save) just disappears.
 * `locked` disables every control inside while the app is read-only (offline, not overridden).
 * Escape (top sheet only, never under the blocking Gate) and the ✕ on wider screens dismiss it the same way.
 * On open the sheet box itself takes focus (never a field, so no keyboard on the phone), and focus goes
 * back to what opened it on close. The first h3 names the dialog.
 */
export function Sheet({ children, onClose, locked }: { children: ReactNode; onClose: () => void; locked?: boolean }) {
  const { readOnly } = useSync();
  const [closing, setClosing] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  // What had focus when the sheet opened (read during the first render, before anything inside takes it).
  const opener = useRef<Element | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = typeof document === "undefined" ? null : document.activeElement;
  const dismissRef = useRef<() => void>(() => {});
  dismissRef.current = dismiss;

  useEffect(() => {
    open = pushSheet(open, id);
    const b = box.current;
    if (b && !b.contains(document.activeElement)) b.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isTopSheet(open, id) || document.querySelector(".scrim:not(.drawer)")) return;
      e.preventDefault();
      dismissRef.current();
    };
    document.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("keydown", key);
      open = dropSheet(open, id);
      const o = opener.current;
      if (o instanceof HTMLElement && o.isConnected && o !== document.body) o.focus({ preventScroll: true });
    };
  }, [id]);

  // Name the dialog by its first heading (the content can change, so look after every render).
  useEffect(() => {
    const h = box.current?.querySelector("h3");
    if (!h || !box.current) return;
    if (!h.id) h.id = `${id}-title`;
    box.current.setAttribute("aria-labelledby", h.id);
  });

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
      <div ref={box} className="glasscard sheet" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="grab" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}><i /></div>
        <button type="button" className="close" aria-label="Close" onClick={dismiss}><CloseIcon /></button>
        <fieldset className="plain" disabled={!!locked && readOnly}>{children}</fieldset>
      </div>
    </div>
  );
}
