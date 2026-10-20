import { useEffect, useReducer, useRef } from "react";
import { CONFIRM_MS, IDLE, confirmStep, type ConfirmEvent, type ConfirmState } from "./confirm";

type Acting = { state: ConfirmState; act: number };

function reduce(cur: Acting, e: ConfirmEvent): Acting {
  const r = confirmStep(cur.state, e);
  return { state: r.state, act: r.act ? cur.act + 1 : cur.act };
}

/**
 * Delete, Skip and End series: the first tap turns the button into a filled confirm with `ask` as its
 * label, the second tap runs `onConfirm`. Waiting, or tapping anywhere else, puts it back.
 * Always `type="button"`, so it never submits the form it sits in.
 */
export function ConfirmButton({ label, ask, onConfirm, danger }: { label: string; ask: string; onConfirm: () => void; danger?: boolean }) {
  const [s, send] = useReducer(reduce, { state: IDLE, act: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const run = useRef(onConfirm);
  run.current = onConfirm;

  useEffect(() => { if (s.act > 0) run.current(); }, [s.act]);

  useEffect(() => {
    if (!s.state.armed) return;
    const t = window.setTimeout(() => send({ type: "timeout" }), CONFIRM_MS);
    const away = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node)) send({ type: "blur" }); };
    document.addEventListener("pointerdown", away, true);
    return () => { window.clearTimeout(t); document.removeEventListener("pointerdown", away, true); };
  }, [s.state]);

  const armed = s.state.armed;
  return (
    <button ref={btn} type="button" className={`btn ${armed ? "armed" : "ghost"}${danger ? " danger" : ""}`}
      onClick={() => send({ type: "tap", now: performance.now() })} onBlur={() => send({ type: "blur" })}>
      <span aria-live="polite">{armed ? ask : label}</span>
    </button>
  );
}
