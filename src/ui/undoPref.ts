// "Keep Undo until dismissed" (Settings, General): the Undo toast stays until closed instead of timing
// out after 8 seconds (WCAG 2.2.1). Per device, like the theme; never synced.
const KEY = "ledger.keepUndo";

export function loadKeepUndo(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveKeepUndo(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(KEY, "1");
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // storage blocked: the setting lasts until reload
  }
}
