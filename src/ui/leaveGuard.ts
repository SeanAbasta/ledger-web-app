import { createContext, useContext, useEffect, useRef, type MutableRefObject } from "react";

/**
 * A screen that holds typed changes can ask before the shell changes room. The guard gets `go` (the
 * change) and returns true when it took over, and will call `go` itself once the person agrees.
 */
export type LeaveGuard = (go: () => void) => boolean;

export const LeaveGuardRef = createContext<MutableRefObject<LeaveGuard | undefined>>({ current: undefined });

/** Register `guard` while the screen is mounted. It may change on every render. */
export function useLeaveGuard(guard: LeaveGuard) {
  const ref = useContext(LeaveGuardRef);
  const latest = useRef(guard);
  latest.current = guard;
  useEffect(() => {
    ref.current = (go) => latest.current(go);
    return () => { ref.current = undefined; };
  }, [ref]);
}
