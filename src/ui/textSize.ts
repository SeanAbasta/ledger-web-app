// In-app text size (Settings, General): Default, Large, Larger. A different answer to zoom that keeps
// the no-zoom choice. Per device, like the theme; public/theme.js applies it before first paint, this
// applies it when it is changed. It sets data-text on the root, and every size follows --ts.

export type TextSize = "default" | "large" | "larger";
export const TEXT_SIZES = ["default", "large", "larger"] as const;

const KEY = "ledger.text";
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const ls = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const parseTextSize = (v: unknown): TextSize => (v === "large" || v === "larger" ? v : "default");

export function loadTextSize(s: Storage | undefined = ls()): TextSize {
  try {
    return parseTextSize(s?.getItem(KEY));
  } catch {
    return "default";
  }
}

/** Returns false if the browser would not store it (the size still applies until reload). */
export function saveTextSize(t: TextSize, s: Storage | undefined = ls()): boolean {
  try {
    if (!s) return false;
    s.setItem(KEY, t);
    return true;
  } catch {
    return false;
  }
}

export function applyTextSize(t: TextSize) {
  if (t === "default") document.documentElement.removeAttribute("data-text");
  else document.documentElement.setAttribute("data-text", t);
}
