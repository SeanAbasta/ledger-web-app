import { addDays } from "../../data/dates";
import type { Entry, IsoDate, SplitMode } from "../../data/schema";
import { participants } from "../../data/splits";

/**
 * Again chips on the Add tab: the notes used most in the last 30 days (three uses or more, at most four),
 * each with the category and split it most often had. A tap fills note, category and split, never the
 * amount, so a wrong guess can never move money. Derived from entries; nothing is stored.
 */
export interface Again {
  note: string;
  category?: string;
  /** Who paid, the mode and the other people in it (person ids), when most uses were split this way. */
  split?: { paidBy: string; mode: SplitMode; people: string[] };
  uses: number;
  last: IsoDate;
}

const key = (note: string) => note.trim().toLowerCase();

/** The most common value, the most recent one winning a tie (items come oldest first). */
function mostCommon<T>(xs: T[], id: (x: T) => string): T | undefined {
  const counts = new Map<string, { x: T; n: number; at: number }>();
  xs.forEach((x, at) => {
    const k = id(x);
    const c = counts.get(k);
    counts.set(k, { x, n: (c?.n ?? 0) + 1, at });
  });
  return [...counts.values()].sort((a, b) => b.n - a.n || b.at - a.at)[0]?.x;
}

export function recents(entries: Entry[], today: IsoDate, opts: { days?: number; min?: number; max?: number } = {}): Again[] {
  const from = addDays(today, -(opts.days ?? 30));
  const used = entries
    .filter((e) => !e.deleted && e.kind === "expense" && !e.refund && e.note?.trim() && e.date >= from && e.date <= today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  const groups = new Map<string, Entry[]>();
  for (const e of used) groups.set(key(e.note!), [...(groups.get(key(e.note!)) ?? []), e]);
  const out: Again[] = [];
  for (const es of groups.values()) {
    if (es.length < (opts.min ?? 3)) continue;
    const latest = es[es.length - 1]!;
    const shape = mostCommon(es.map((e) => e.split), (s) => (s ? `${s.paidBy}|${s.mode}|${participants(s).sort().join(",")}` : ""));
    out.push({
      note: latest.note!.trim(),
      category: mostCommon(es.map((e) => e.category ?? ""), (c) => c) || undefined,
      split: shape ? { paidBy: shape.paidBy, mode: shape.mode, people: participants(shape) } : undefined,
      uses: es.length,
      last: latest.date,
    });
  }
  return out.sort((a, b) => b.uses - a.uses || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)).slice(0, opts.max ?? 4);
}
