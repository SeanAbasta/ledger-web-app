import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { useLedger } from "./Ledger";
import { useSync } from "./Sync";
import { loadKeepUndo } from "./undoPref";

/** One toast: what just happened, an optional second line, and the way back. */
export interface ToastSpec {
  message: string;
  sub?: string;
  /** Puts things back. A throw shows `failed` (else the Save wording) instead. */
  undo?: () => Promise<void>;
  failed?: string;
}

/** What is left when an Undo throws, said for each kind of Undo. */
export const UNDO_FAILED = {
  save: "Could not undo. The entry is still in your Ledger.",
  delete: "Could not undo. The entry is still deleted.",
  settle: "Could not undo. The payment is still recorded.",
} as const;

const MS = 8000;

const C = createContext<{ show: (t: ToastSpec) => void; clear: () => void }>({ show: () => {}, clear: () => {} });
export const useToast = () => useContext(C);

/**
 * The Undo toast, one at a time: a new write replaces it. It lives in the shell, so it survives a tab
 * change. 8 seconds, paused while hovered, focused or pressed, or kept until closed (Settings). It is a
 * polite status region and never takes focus. On a conflict or a token problem it clears and the pill
 * speaks instead.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { changed } = useLedger();
  const { status } = useSync();
  const [t, setT] = useState<(ToastSpec & { n: number; keep: boolean }) | undefined>();
  const [paused, setPaused] = useState(false);
  const left = useRef(MS);
  const started = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const count = useRef(0);
  const timed = useRef(0); // which toast `left` belongs to

  const clear = useCallback(() => { window.clearTimeout(timer.current); setT(undefined); }, []);
  const show = useCallback((s: ToastSpec) => {
    window.clearTimeout(timer.current);
    setPaused(false);
    setT({ ...s, n: ++count.current, keep: loadKeepUndo() });
  }, []);

  // The timer: runs while shown and not paused; a pause keeps what is left.
  useEffect(() => {
    if (!t || t.keep || paused) return;
    if (timed.current !== t.n) { timed.current = t.n; left.current = MS; }
    started.current = Date.now();
    timer.current = window.setTimeout(() => setT(undefined), left.current);
    return () => {
      window.clearTimeout(timer.current);
      left.current = Math.max(0, left.current - (Date.now() - started.current));
    };
  }, [t, paused]);

  useEffect(() => { if (status.state === "conflict" || status.state === "error") clear(); }, [status.state, clear]);

  async function undo() {
    if (!t?.undo) return;
    const run = t.undo;
    const failed = t.failed ?? UNDO_FAILED.save;
    clear();
    try {
      await run();
      changed();
    } catch {
      show({ message: failed });
    }
  }

  const hold = { onPointerEnter: () => setPaused(true), onPointerLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false), onPointerDown: () => setPaused(true) };
  return (
    <C.Provider value={{ show, clear }}>
      {children}
      <div className="toastzone" role="status" aria-live="polite">
        {t && (
          <div key={t.n} className={paused ? "toast paused" : "toast"} {...hold}>
            <div className="toast-text">
              <b>{t.message}</b>
              {t.sub && <span className="toast-sub">{t.sub}</span>}
            </div>
            {t.undo && <button type="button" className="toast-undo" onClick={() => void undo()}>Undo</button>}
            {t.keep && <button type="button" className="toast-close" aria-label="Dismiss" onClick={clear}><CloseIcon /></button>}
            {!t.keep && <i className="toast-line" aria-hidden="true" />}
          </div>
        )}
      </div>
    </C.Provider>
  );
}
