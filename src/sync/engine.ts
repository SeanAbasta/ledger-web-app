// Drives the handoff and keeps the status the toolbar pill shows.
import type { Bundle } from "../data/bundle";
import type { LedgerStore } from "../data/db";
import { GitHubError } from "./github";
import { ChecksumError, check, push, resolve, verify, type Choice, type Ctx } from "./handoff";

export type SyncState = "unconfigured" | "checking" | "synced" | "syncing" | "needs-sync" | "offline" | "conflict" | "error";

export interface SyncStatus {
  state: SyncState;
  /** One plain line for the UI, when something needs saying. */
  message?: string;
  lastSynced?: string;
  /** When a rate-limited call will be retried (epoch ms). */
  retryAt?: number;
}

export interface EngineOptions {
  ctx: Ctx | null;
  saveBackup: (name: string, bundle: Bundle) => void;
  /** Called after a pull or a resolution replaced local data, so screens can reload. */
  onDataChanged?: () => void;
  debounceMs?: number;
  /** Returns a cancel function. Injectable for tests. */
  schedule?: (fn: () => void, ms: number) => () => void;
  now?: () => number;
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export class SyncEngine {
  status: SyncStatus = { state: "unconfigured" };
  private ctx: Ctx | null;
  private listeners = new Set<(s: SyncStatus) => void>();
  private cancelTimer?: () => void;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = false;
  private deletions: string[] = [];

  constructor(private store: LedgerStore, private o: EngineOptions) {
    this.ctx = o.ctx;
    if (!this.ctx) this.status = { state: "unconfigured", message: "Connect GitHub to sync" };
  }

  subscribe(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** True while changes exist that are not safely on GitHub. Use for the beforeunload warning. */
  get hasUnsynced(): boolean {
    return this.pending;
  }

  /** Edits are allowed unless a conflict or a missing setup needs attention first. */
  get readOnly(): boolean {
    return this.status.state === "conflict" || this.status.state === "checking";
  }

  setContext(ctx: Ctx | null) {
    this.ctx = ctx;
    if (!ctx) this.set({ state: "unconfigured", message: "Connect GitHub to sync" });
  }

  private set(s: SyncStatus) {
    this.status = { ...s, lastSynced: s.lastSynced ?? this.status.lastSynced };
    for (const l of this.listeners) l(this.status);
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async refreshPending() {
    this.pending = (await this.store.dirtyPaths()).length > 0;
  }

  private async stamp(): Promise<string | undefined> {
    return this.store.getMeta<string>("lastSynced");
  }

  private fail(e: unknown) {
    if (e instanceof GitHubError) {
      if (e.kind === "network") return this.set({ state: "offline", message: "Offline" });
      if (e.kind === "rate") {
        this.schedule(Math.max((e.retryAt ?? 0) - (this.o.now ?? Date.now)(), 1000), () => void this.flush());
        return this.set({ state: "needs-sync", message: "Sync paused, will retry", retryAt: e.retryAt });
      }
      if (e.kind === "auth") return this.set({ state: "error", message: "Token expired. Replace it in Settings" });
      if (e.kind === "forbidden" || e.kind === "notfound") return this.set({ state: "error", message: "No access to the data repo" });
      return this.set({ state: "error", message: e.message });
    }
    if (e instanceof ChecksumError) return this.set({ state: "error", message: "Download failed verification. Nothing was changed" });
    this.set({ state: "error", message: e instanceof Error ? e.message : "Sync failed" });
  }

  private schedule(ms: number, fn: () => void) {
    this.cancelTimer?.();
    this.cancelTimer = (this.o.schedule ?? defaultSchedule)(fn, ms);
  }

  /** On open (and when coming back online): check the remote before anything is edited. */
  open(): Promise<void> {
    return this.run(async () => {
      if (!this.ctx) return;
      this.set({ state: "checking" });
      try {
        const r = await check(this.store, this.ctx);
        await this.refreshPending();
        if (r === "conflict") return this.set({ state: "conflict", message: "This device and GitHub both changed" });
        if (r === "pulled") this.o.onDataChanged?.();
        if (r === "needs-push") return await this.flushNow();
        this.set({ state: "synced", lastSynced: await this.stamp() });
      } catch (e) {
        await this.refreshPending();
        this.fail(e);
      }
    });
  }

  /** Call after every local write. Pushes shortly after the last edit. */
  changed() {
    this.pending = true;
    if (!this.ctx || this.status.state === "conflict") return;
    if (this.status.state !== "offline") this.set({ state: "needs-sync" });
    this.schedule(this.o.debounceMs ?? 7000, () => void this.flush());
  }

  flush(): Promise<void> {
    return this.run(() => this.flushNow());
  }

  private async flushNow(): Promise<void> {
    if (!this.ctx) return;
    this.cancelTimer?.();
    this.set({ state: "syncing" });
    try {
      const r = await push(this.store, this.ctx, { deletions: this.deletions });
      if (r.status === "conflict") {
        await this.refreshPending();
        return this.set({ state: "conflict", message: "GitHub has newer changes" });
      }
      if (r.status === "pushed") this.deletions = [];
      await this.refreshPending();
      if (this.pending) {
        this.set({ state: "needs-sync" });
        return this.schedule(this.o.debounceMs ?? 7000, () => void this.flush());
      }
      this.set({ state: "synced", lastSynced: await this.stamp() });
    } catch (e) {
      await this.refreshPending();
      this.fail(e);
    }
  }

  /**
   * The "Sync now" button: push anything pending, then re-read the remote and compare.
   * Only a true result means it is safe to close.
   */
  syncNow(): Promise<{ safeToClose: boolean }> {
    return this.run(async () => {
      if (!this.ctx) return { safeToClose: false };
      if (this.status.state === "conflict") return { safeToClose: false };
      await this.refreshPending();
      if (this.pending) await this.flushNow();
      if (this.status.state !== "synced") return { safeToClose: false };
      this.set({ state: "syncing" });
      try {
        const v = await verify(this.store, this.ctx);
        await this.refreshPending();
        if (v.ok) {
          this.set({ state: "synced", lastSynced: await this.stamp() });
          return { safeToClose: true };
        }
        this.set({ state: v.reason === "behind" ? "conflict" : "error", message: v.reason === "behind" ? "GitHub has newer changes" : "GitHub does not match this device. Try again" });
        return { safeToClose: false };
      } catch (e) {
        this.fail(e);
        return { safeToClose: false };
      }
    });
  }

  resolve(choice: Choice): Promise<void> {
    return this.run(async () => {
      if (!this.ctx) return;
      this.set({ state: "syncing" });
      try {
        const { deletions } = await resolve(this.store, this.ctx, choice, this.o.saveBackup);
        this.deletions = deletions;
        this.o.onDataChanged?.();
        await this.refreshPending();
        await this.flushNow();
      } catch (e) {
        await this.refreshPending();
        this.fail(e);
      }
    });
  }
}
