// Connection settings for this device. The token lives in this browser's localStorage only:
// never in a URL, never logged, never in the public repo.

export interface SyncConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  /** YYYY-MM-DD, typed in by the user so the app can warn before the token lapses. */
  tokenExpires?: string;
}

const KEY = "ledger.sync";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

const ls = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // blocked or unavailable (private window, site data disabled)
  }
};

export function loadConfig(s: Storage | undefined = ls()): SyncConfig | null {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<SyncConfig>;
    return c.token && c.owner && c.repo ? (c as SyncConfig) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser would not store it. */
export function saveConfig(c: SyncConfig, s: Storage | undefined = ls()): boolean {
  try {
    if (!s) return false;
    s.setItem(KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function clearConfig(s: Storage | undefined = ls()): void {
  try {
    s?.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

/** Whole days until the token expires; negative once it has. Undefined when no date was entered. */
export function daysLeft(c: SyncConfig | null, today: Date = new Date()): number | undefined {
  if (!c?.tokenExpires || !/^\d{4}-\d{2}-\d{2}$/.test(c.tokenExpires)) return undefined;
  const [y, m, d] = c.tokenExpires.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}

/** Short device name for commit messages, e.g. "Mac-3f2a". */
export function deviceName(id: string, platform: string = typeof navigator === "undefined" ? "" : navigator.platform): string {
  const os = /mac/i.test(platform) ? "Mac" : /win/i.test(platform) ? "Windows" : /linux/i.test(platform) ? "Linux" : "Browser";
  return `${os}-${id.slice(-4).toLowerCase()}`;
}
