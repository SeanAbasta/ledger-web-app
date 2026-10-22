/**
 * The first-run checklist on the Add tab: name an account, set up sync, add a salary. Shown once, until
 * everything on it is done or it is dismissed (per device); it never comes back.
 */
export function firstRun(s: { accounts: number; synced: boolean; salary: boolean; dismissed: boolean }) {
  const account = s.accounts > 0;
  return { show: !s.dismissed && !(account && s.synced && s.salary), account, sync: s.synced, salary: s.salary };
}

const KEY = "ledger.firstRun";
export function loadDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "done";
  } catch {
    return false;
  }
}
export function saveDismissed(): void {
  try {
    globalThis.localStorage?.setItem(KEY, "done");
  } catch {
    // storage blocked: it hides until reload
  }
}
