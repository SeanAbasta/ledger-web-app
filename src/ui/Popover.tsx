import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type PointerEvent, type MouseEvent } from "react";

/** Which item a popover is open for, what it points at, and whether a tap (or click) pinned it open. */
interface Open<K> { key: K; anchor: Element; pinned: boolean }

/**
 * A small breakdown popover for charts. Hover opens it with a mouse; a tap or click pins it open, a
 * second tap on the same thing or a tap anywhere else closes it, and Escape closes it and returns focus.
 * `trigger(key)` gives the handlers to spread on each bar, segment or legend row.
 */
export function usePopover<K extends string | number>() {
  const [open, setOpen] = useState<Open<K>>();
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(undefined), []);

  useEffect(() => {
    if (!open) return;
    const down = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !open.anchor.contains(t)) setOpen(undefined);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(undefined);
      if (open.anchor instanceof HTMLElement) open.anchor.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const trigger = (key: K) => ({
    // Only a real mouse hovers; a tap on a phone also sends pointer events, which must not open it twice.
    onPointerEnter: (e: PointerEvent<Element>) => {
      if (e.pointerType === "mouse") { const anchor = e.currentTarget; setOpen((o) => (o?.pinned ? o : { key, anchor, pinned: false })); }
    },
    onPointerLeave: (e: PointerEvent<Element>) => {
      if (e.pointerType === "mouse") setOpen((o) => (o && !o.pinned && o.key === key ? undefined : o));
    },
    onClick: (e: MouseEvent<Element>) => {
      const anchor = e.currentTarget;
      setOpen((o) => (o?.key === key && o.pinned ? undefined : { key, anchor, pinned: true }));
    },
  });

  return { open, openKey: open?.key, trigger, close, popRef };
}

/**
 * The popover itself, drawn inside `container` (the chart's card) with `position: absolute`. It is kept
 * inside the card's width, sits under what it points at, and moves above it when it would land under the
 * phone tab bar or off the bottom of the screen. Placement goes through React's style prop (the CSP allows it).
 */
export function Popover({ open, container, popRef, id, label, children }: {
  open?: { anchor: Element };
  container: RefObject<HTMLElement | null>;
  popRef: RefObject<HTMLDivElement | null>;
  id: string;
  label: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ left: number; top: number }>();

  useLayoutEffect(() => {
    const place = () => {
      const box = container.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!open || !box || !pop) return;
      const a = open.anchor.getBoundingClientRect();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const gap = 6;
      const left = Math.min(Math.max(8, a.left + a.width / 2 - box.left - w / 2), Math.max(8, box.width - w - 8));
      // The phone tab bar floats over the bottom of the page (fixed); on computers it is the sidebar.
      const bar = document.querySelector(".side");
      const barTop = bar && getComputedStyle(bar).position === "fixed" ? bar.getBoundingClientRect().top : innerHeight;
      const limit = Math.min(innerHeight, barTop) - 8;
      const below = a.bottom + gap + h <= limit || a.top - gap - h < 8;
      setPos({ left, top: below ? a.bottom - box.top + gap : a.top - box.top - gap - h });
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, [open, container, popRef]);

  useEffect(() => { if (!open) setPos(undefined); }, [open]);

  if (!open) return null;
  return (
    <div ref={popRef} id={id} role="region" aria-label={label} className={pos ? "pop" : "pop measuring"} style={pos ? { left: pos.left, top: pos.top } : undefined}>
      {children}
    </div>
  );
}
