// Light is the default; dark is opt-in. The preference is per device (it is not synced).
// public/theme.js applies it before first paint; this applies it when the user changes it.

export type Theme = "light" | "dark" | "auto";
export const THEMES = ["light", "dark", "auto"] as const;

const KEY = "ledger.theme";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const ls = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const parseTheme = (v: unknown): Theme => (v === "dark" || v === "auto" ? v : "light");

export const resolveTheme = (pref: Theme, systemDark: boolean): "light" | "dark" => (pref === "dark" || (pref === "auto" && systemDark) ? "dark" : "light");

export function loadTheme(s: Storage | undefined = ls()): Theme {
  try {
    return parseTheme(s?.getItem(KEY));
  } catch {
    return "light";
  }
}

/** Returns false if the browser would not store it (the theme still applies until reload). */
export function saveTheme(t: Theme, s: Storage | undefined = ls()): boolean {
  try {
    if (!s) return false;
    s.setItem(KEY, t);
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(t: Theme) {
  const dark = resolveTheme(t, typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e0f12" : "#eef0f5");
}
