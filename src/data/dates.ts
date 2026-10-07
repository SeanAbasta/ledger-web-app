// Calendar math on "YYYY-MM-DD" strings. Pure UTC arithmetic, so no timezone or DST surprises.
import type { IsoDate } from "./schema";

const pad = (n: number) => String(n).padStart(2, "0");

export function parts(d: IsoDate): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y!, m!, day!];
}

export const iso = (y: number, m: number, d: number): IsoDate => `${y}-${pad(m)}-${pad(d)}`;

export function today(): IsoDate {
  const n = new Date();
  return iso(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add months keeping the anchor's day of month, clamped (Jan 31 + 1 = Feb 28/29). */
export function addMonths(anchor: IsoDate, n: number): IsoDate {
  const [y, m, day] = parts(anchor);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(d: IsoDate): number {
  const [y, m, day] = parts(d);
  return (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7;
}

export const weekStart = (d: IsoDate): IsoDate => addDays(d, -weekday(d));
export const monthStart = (d: IsoDate): IsoDate => d.slice(0, 7) + "-01";
export const monthEnd = (d: IsoDate): IsoDate => {
  const [y, m] = parts(d);
  return iso(y, m, daysInMonth(y, m));
};

/** Month keys "YYYY-MM" from `from` to `to`, inclusive. */
export function monthKeysBetween(from: IsoDate, to: IsoDate): string[] {
  const out: string[] = [];
  let [y, m] = parts(from);
  const [ty, tm] = parts(to);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function labelDay(d: IsoDate): string {
  const [, m, day] = parts(d);
  return `${DAYS[weekday(d)]} ${MONTHS[m - 1]} ${day}`;
}

export function labelMonth(d: IsoDate): string {
  const [y, m] = parts(d);
  return `${MONTHS[m - 1]} ${y}`;
}

export function labelShort(d: IsoDate): string {
  const [, m, day] = parts(d);
  return `${MONTHS[m - 1]} ${day}`;
}
