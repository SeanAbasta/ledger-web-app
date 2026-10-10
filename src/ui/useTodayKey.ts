import { useEffect, useRef } from "react";

/** Desktop shortcut: T jumps back to today. Ignored while typing, with a modifier held, or with a sheet open. */
export function useTodayKey(onToday: () => void) {
  const fn = useRef(onToday);
  fn.current = onToday;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))) return;
      if (document.querySelector(".scrim")) return;
      fn.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
