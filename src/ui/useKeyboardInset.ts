import { useEffect } from "react";

/** Less than this between the visible area and the layout bottom is a toolbar, not a keyboard. */
const KEYBOARD_PX = 80;

/**
 * Sticky Save with the phone keyboard open. While a field has focus on a phone, the root gets one class,
 * `kb-open` (the tab bar hides so Save sits on the keyboard), and `--kb`, the keyboard's height read from
 * visualViewport, so the Save bar can ride on top of it. One class and one variable, easy to take back out.
 */
export function useKeyboardInset(on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLElement && a.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea");
    };
    // Only when the keyboard really takes space: a field focused on open (the amount) shows no keyboard
    // on iPhone until it is tapped, and the tab bar must not vanish then.
    const update = () => {
      const inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      const open = typing() && matchMedia("(max-width: 700px)").matches && inset > KEYBOARD_PX;
      root.classList.toggle("kb-open", open);
      root.style.setProperty("--kb", `${open ? inset : 0}px`);
    };
    // Focus moves after focusout, so look once the new element has it.
    const later = () => window.setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    update();
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      root.classList.remove("kb-open");
      root.style.removeProperty("--kb");
    };
  }, [on]);
}
