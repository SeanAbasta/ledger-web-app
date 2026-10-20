import { useLayoutEffect, useRef } from "react";

/**
 * Segmented control: a radio group of buttons. A raised key slides under the picked one: its place and
 * width are read from the picked button after layout (and again when the control resizes), so segments
 * keep their own widths. Until it has been measured (or with nothing to measure) the picked button draws
 * the key itself. The first placement does not slide.
 */
export function Segmented<T extends string>({ value, options, onChange, labels }: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = (slide: boolean) => {
      const on = el.querySelector<HTMLElement>("button.on");
      if (!on || !on.offsetWidth) return;
      el.classList.toggle("still", !slide);
      el.style.setProperty("--thumb-x", `${on.offsetLeft}px`);
      el.style.setProperty("--thumb-w", `${on.offsetWidth}px`);
      el.classList.add("thumbed");
      placed.current = true;
    };
    place(placed.current);
    // A resize (fonts, a rotated phone) re-places the key without sliding. The observer's first call is
    // the initial size, already handled, and must not cut the slide short.
    let first = true;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if (first) first = false; else place(false); }) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value, options]);

  return (
    <span ref={box} className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </span>
  );
}
