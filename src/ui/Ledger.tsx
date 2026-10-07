import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LedgerStore } from "../data/db";

interface Ctx {
  store: LedgerStore;
  /** Bumps after every write so screens reload. */
  rev: number;
  changed: () => void;
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
  const changed = useCallback(() => setRev((r) => r + 1), []);
  const value = useMemo(() => (store ? { store, rev, changed } : null), [store, rev, changed]);
  if (!value) return null;
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useLedger(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useLedger outside provider");
  return v;
}
