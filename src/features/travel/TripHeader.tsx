import type { Minor, Trip, TripItem } from "../../data/schema";
import { dayRail } from "../../data/tripMath";

/**
 * One small cell per day of the trip, shaded like the Dashboard calendar: how much was spent that day,
 * today ringed, days not reached yet as outlines. It is a picture of the same facts the text line gives
 * ("Day 3 of 7"), so it is hidden from screen readers.
 */
export function DayRail({ trip, items, base, today }: { trip: Trip; items: TripItem[]; base: string; today: string }) {
  const cells = dayRail(trip, items, base, today);
  // One row up to 14 days; a longer trip wraps on the calendar's seven columns.
  const cols = cells.length <= 14 ? cells.length : 7;
  return (
    <div className="lattice dayrail" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 44}px` }}>
      {cells.map((c) => {
        const cls = c.state === "later" ? (c.level ? "cell plan" : "cell later") : c.level ? `cell l${c.level}` : "cell quiet";
        return <span key={c.date} className={c.state === "today" ? `${cls} now` : cls}>{Number(c.date.slice(8))}</span>;
      })}
    </div>
  );
}

/**
 * The budget as a bar built like the credit-used bar. Its ticks are the trip's days, so one glance
 * compares money used with time used. Over budget it is full and amber, never red.
 */
export function BudgetMeter({ budget, mine, days, label }: { budget: Minor; mine: Minor; days: number; label: string }) {
  const used = budget > 0 ? Math.max(0, mine) / budget : mine > 0 ? 1 : 0;
  const pct = Math.min(1, used);
  const ticks = days > 1 && days <= 31 ? Array.from({ length: days - 1 }, (_, i) => ((i + 1) * 100) / days) : [];
  return (
    <div className={used > 1 ? "usedbar tripmeter high" : "usedbar tripmeter"} role="meter" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-valuetext={label}>
      <i style={{ width: `${pct > 0 ? Math.max(2, pct * 100) : 0}%` }} />
      {ticks.length > 0 && (
        <svg className="ticks" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {ticks.map((x) => <line key={x} x1={x} y1={0} x2={x} y2={10} />)}
        </svg>
      )}
    </div>
  );
}
