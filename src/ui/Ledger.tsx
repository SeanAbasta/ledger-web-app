import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LedgerStore } from "../data/db";

interface Ctx {
  store: LedgerStore;
  /** Bumps after every write so screens reload. */
  rev: number;
  /** Call after a local write: reloads screens and tells sync there is something to push. */
  changed: () => void;
  /** Reload screens without counting it as a local write (after a pull). */
  refresh: () => void;
  /** Run `fn` after every local write. Returns an unsubscribe. */
  onWrite: (fn: () => void) => () => void;
}

const C = createContext<Ctx | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<LedgerStore>();
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let s: LedgerStore;
    LedgerStore.open().then((x) => {
      s = x;
      setStore(x);
    });
    return () => s?.close();
  }, []);
  const hooks = useRef(new Set<() => void>());
  const refresh = useCallback(() => setRev((r) => r + 1), []);
  const changed = useCallback(() => {
    setRev((r) => r + 1);
    hooks.current.forEach((h) => h());
  }, []);
  const onWrite = useCallback((fn: () => void) => {
    hooks.current.add(fn);
    return () => void hooks.current.delete(fn);
  }, []);
  const value = useMemo(() => (store ? { store, rev, changed, refresh, onWrite } : null), [store, rev, changed, refresh, onWrite]);
  if (!value) return null;
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useLedger(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useLedger outside provider");
  return v;
}
