import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts on computers: N new (Add), / search (Ledger), [ and ] the previous and next period,
 * T today. Ignored while typing in a field, with a modifier held, on a held key or with a sheet open.
 * Settings, General has an Off switch (per device; WCAG 2.1.4), which also turns off T.
 */
export type Shortcut = "new" | "search" | "prev" | "next" | "today";

const KEYS: Record<string, Shortcut> = { n: "new", N: "new", "/": "search", "[": "prev", "]": "next", t: "today", T: "today" };

export function shortcutFor(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; repeat: boolean; typing: boolean; sheetOpen: boolean }, on: boolean): Shortcut | null {
  if (!on || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.typing || e.sheetOpen) return null;
  return KEYS[e.key] ?? null;
}

const KEY = "ledger.shortcuts";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
const ls = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function loadShortcutsOn(s: Storage | undefined = ls()): boolean {
  try {
    return s?.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveShortcutsOn(on: boolean, s: Storage | undefined = ls()): void {
  try {
    if (on) s?.removeItem(KEY);
    else s?.setItem(KEY, "off");
  } catch {
    // storage blocked: lasts until reload
  }
}

/** Runs `on(shortcut)` for each shortcut pressed, reading the Off switch on each key press. */
export function useShortcuts(on: (s: Shortcut, e: KeyboardEvent) => void) {
  const fn = useRef(on);
  fn.current = on;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
      const s = shortcutFor({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, repeat: e.repeat, typing, sheetOpen: !!document.querySelector(".scrim") }, loadShortcutsOn());
      if (s) fn.current(s, e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
