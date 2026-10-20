import { useState, type CSSProperties } from "react";

// The bezel: a machined ring gauge around Spent. It draws a ratio and nothing else: this month so far
// against last month's same days, the same number the old Spent bar used. 20 graduations of 5%, a long
// mark at the top for 100%, the arc at its true length, and anything past 100% as a dashed amber arc
// just inside the graduations (one extra turn at most). With no ratio (no earlier data) the ring is
// empty. Decorative to assistive tech: the line of text beside it carries the meaning.

const C = 70; // centre of the 140 x 140 box
const R = 54; // the track
const RO = 61; // the overage arc
const LEN = 2 * Math.PI * R;

function at(r: number, turn: number): [number, number] {
  const a = turn * 2 * Math.PI - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(r: number, turn: number): string {
  const [x0, y0] = at(r, 0);
  if (turn >= 1) {
    const [x1, y1] = at(r, 0.5);
    return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1} A ${r} ${r} 0 1 1 ${x0} ${y0}`;
  }
  const [x1, y1] = at(r, turn);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${turn > 0.5 ? 1 : 0} 1 ${x1} ${y1}`;
}

const TICKS = Array.from({ length: 20 }, (_, i) => {
  const [x1, y1] = at(i === 0 ? 59.5 : 64.5, i / 20);
  const [x2, y2] = at(68, i / 20);
  return <line key={i} className={i === 0 ? "lt" : "st"} x1={x1} y1={y1} x2={x2} y2={y2} />;
});

/** `sweep`: draw the arc in once (the Dashboard's first numbers only; CSS skips it under Reduce Motion). */
export function Bezel({ ratio, sweep }: { ratio?: number; sweep?: boolean }) {
  // Decided when the ring mounts, so a re-render a moment later (a popover closing) never cuts the sweep short.
  const [sweeping] = useState(!!sweep);
  const r = ratio === undefined ? 0 : Math.max(0, ratio);
  const main = Math.min(1, r) * LEN;
  const over = Math.min(1, r - 1);
  return (
    <svg className={sweeping ? "bezel sweep" : "bezel"} viewBox="0 0 140 140" aria-hidden="true" focusable="false">
      {TICKS}
      <circle className="btrack" cx={C} cy={C} r={R} />
      {main > 0 && <circle className="barc" cx={C} cy={C} r={R} strokeDasharray={`${main} ${LEN}`} transform={`rotate(-90 ${C} ${C})`} style={{ "--arc": `${main}` } as CSSProperties} />}
      {over > 0 && <path className="bover" d={arc(RO, over)} />}
    </svg>
  );
}
