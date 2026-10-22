import { useShortcuts } from "./shortcuts";

/** Desktop shortcut: T jumps back to today (Ledger, Dashboard). The rules and the Off switch are in shortcuts.ts. */
export function useTodayKey(onToday: () => void) {
  useShortcuts((s) => { if (s === "today") onToday(); });
}
