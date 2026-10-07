import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bundleText } from "../data/bundle";
import { SyncEngine, type SyncStatus } from "../sync/engine";
import { GitHubApi } from "../sync/github";
import { clearConfig, deviceName, loadConfig, saveConfig, type SyncConfig } from "../sync/config";
import { ulid } from "../data/ulid";
import { downloadText } from "./download";
import { useLedger } from "./Ledger";

interface Ctx {
  engine: SyncEngine;
  status: SyncStatus;
  config: SyncConfig | null;
  /** True while editing must wait: offline (until overridden). */
  readOnly: boolean;
  editOffline: () => void;
  connect: (c: SyncConfig) => boolean;
  disconnect: () => void;
}

const C = createContext<Ctx | null>(null);

async function makeCtx(store: ReturnType<typeof useLedger>["store"], c: SyncConfig) {
  let id = await store.getMeta<string>("deviceId");
  if (!id) {
    id = ulid();
    await store.setMeta("deviceId", id);
  }
  return { api: new GitHubApi({ token: c.token, owner: c.owner, repo: c.repo, branch: c.branch }), device: deviceName(id) };
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { store, onWrite, refresh } = useLedger();
  const [config, setConfig] = useState<SyncConfig | null>(() => loadConfig());
  const [override, setOverride] = useState(false);
  const engine = useMemo(() => {
    const e = new SyncEngine(store, {
      ctx: null,
      onDataChanged: refresh,
      saveBackup: (name, b) => downloadText(bundleText(b), `ledger-${name}-${new Date().toISOString().slice(0, 10)}.json`),
    });
    if (loadConfig()) e.markChecking();
    return e;
  }, [store, refresh]);
  const [status, setStatus] = useState<SyncStatus>(engine.status);
  const started = useRef<string | undefined>(undefined);

  useEffect(() => engine.subscribe((s) => { setStatus(s); if (s.state !== "offline") setOverride(false); }), [engine]);
  useEffect(() => onWrite(() => engine.changed()), [engine, onWrite]);

  // Start (or restart) whenever the connection changes: check the remote before anything is edited.
  useEffect(() => {
    const key = config ? `${config.owner}/${config.repo}/${config.token}` : "";
    if (started.current === key) return;
    started.current = key;
    if (!config) return engine.setContext(null);
    void makeCtx(store, config).then((ctx) => { engine.setContext(ctx); void engine.open(); });
  }, [config, engine, store]);

  // Warn before closing with changes that are not on GitHub; retry when the network returns.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (engine.hasUnsynced) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const online = () => { if (engine.status.state === "offline") void engine.open(); };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("online", online);
    };
  }, [engine]);

  const connect = useCallback((c: SyncConfig) => {
    if (!saveConfig(c)) return false;
    setConfig(c);
    return true;
  }, []);
  const disconnect = useCallback(() => {
    clearConfig();
    setConfig(null);
  }, []);

  const value: Ctx = {
    engine, status, config,
    readOnly: status.state === "offline" && !override,
    editOffline: () => setOverride(true),
    connect, disconnect,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSync(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useSync outside provider");
  return v;
}
