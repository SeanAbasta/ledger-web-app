import { useEffect, useState } from "react";

/** True at 1200 px and up: the desktop layouts (two-pane Ledger, two-column Add). Follows resizes. */
export function useWide(): boolean {
  const q = "(min-width: 1200px)";
  const [wide, setWide] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
