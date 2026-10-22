import { addMonths, labelShort } from "./dates";
import { splitEvenly } from "./money";
import { occurrences } from "./rules";
import type { Frequency, IsoDate, Minor, Rule, SplitShare } from "./schema";
import { participants, splitForSave } from "./splits";

/**
 * Edit a whole plan: its start, how often, how many payments and the total (installments), its end
 * (recurring), note, category and account. Payments are never stored, they come from the plan, so a
 * change here moves, adds or removes payments that already posted. diffPlan says what before saving.
 */
export interface PlanPatch {
  start: IsoDate;
  frequency: Frequency;
  /** Installments: number of payments (2 or more) and the total. */
  count?: number;
  total?: Minor;
  /** Recurring: the last day, or "" for no end. */
  end?: IsoDate | "";
  note?: string;
  category?: string;
  accountId?: string;
}

/** What the edit form starts with: the plan as it is. */
export function patchOf(rule: Rule): PlanPatch {
  return { start: rule.start, frequency: rule.frequency, count: rule.count, total: rule.total, end: rule.end ?? "", note: rule.note, category: rule.category, accountId: rule.accountId };
}

const scheduleOnly = (r: Rule): Rule => ({ ...r, skipped: undefined, overrides: undefined });
const isPaymentDate = (r: Rule, d: IsoDate) => occurrences(scheduleOnly(r), d, d).length > 0;

/**
 * The plan after the edit. Installments: amount is the first payment of splitEvenly(total, count), as the
 * Add form writes it, and a split follows the new amount. Skipped and edited payments survive only on
 * dates that are still payment dates. Recurring: revisions before the new start are dropped, and a
 * changed note, category or account applies to every payment, so later revisions lose that field.
 */
export function applyPlanEdit(rule: Rule, patch: PlanPatch): Rule {
  let next: Rule = { ...rule, start: patch.start, frequency: patch.frequency, note: patch.note || undefined, category: patch.category || undefined, accountId: patch.accountId || undefined };
  if (rule.type === "installment") {
    const count = patch.count ?? rule.count ?? 1;
    const total = patch.total ?? rule.total ?? rule.amount * count;
    const amount = splitEvenly(total, count)[0]!;
    next = { ...next, count, total, amount };
    if (rule.split && amount !== rule.amount) {
      const s = rule.split;
      // Custom shares scale with the payment; the other modes are rebuilt by their own rule.
      const custom: SplitShare[] | undefined = s.mode === "custom" ? s.shares.map((x) => ({ ...x, amount: Math.floor((x.amount * amount) / rule.amount) })) : undefined;
      next.split = splitForSave({ original: { amount: rule.amount, split: s }, amount, paidBy: s.paidBy, mode: s.mode, people: participants(s), custom });
    }
  } else {
    next.end = patch.end ? patch.end : undefined;
    const changed = { note: next.note !== rule.note, category: next.category !== rule.category, accountId: next.accountId !== rule.accountId };
    const revisions = (rule.revisions ?? [])
      .filter((r) => r.from >= patch.start)
      .map((r) => {
        const x = { ...r };
        if (changed.note) delete x.note;
        if (changed.category) delete x.category;
        if (changed.accountId) delete x.accountId;
        return x;
      })
      .filter((r) => r.amount !== undefined || r.note !== undefined || r.category !== undefined || r.accountId !== undefined);
    next.revisions = revisions.length ? revisions : undefined;
  }
  if (rule.skipped) next.skipped = rule.skipped.filter((d) => isPaymentDate(next, d));
  if (rule.overrides) next.overrides = Object.fromEntries(Object.entries(rule.overrides).filter(([d]) => isPaymentDate(next, d)));
  return next;
}

export interface PlanDiff {
  /** Payments that will appear in the past (dated today or earlier), with their amounts. */
  addedPast: { date: IsoDate; amount: Minor }[];
  /** Payments already posted that go away. */
  removedPast: { date: IsoDate; amount: Minor }[];
  /** Posted payments that move to another date (paired in order). */
  moved: { from: IsoDate; to: IsoDate }[];
  /** Posted payments that stay on their date with a different amount. */
  changedPast: number;
  /** Payments after today whose date or amount changes, or that appear or go. */
  changedFuture: number;
  /** Skipped and edited payments that are dropped. */
  reset: number;
  /** A posted payment moves, appears or goes (an amount change alone is said in its own line). */
  postedMove: boolean;
  unchanged: boolean;
}

/**
 * What an edit does, comparing the payment schedules of the old and new plan (skips and edits aside;
 * those that drop are counted in `reset`). Posted payments (today or earlier) are compared by date:
 * new dates are added, lost dates removed, and an added and a removed one pair up as a move. Later
 * payments are compared in order. A plan with no end is compared for the next 12 months.
 */
export function diffPlan(before: Rule, after: Rule, today: IsoDate): PlanDiff {
  const finite = (r: Rule) => r.type === "installment" || !!r.end;
  const latest = [today, before.start, after.start].sort().at(-1)!;
  const until = finite(before) && finite(after) ? "9999-12-31" : addMonths(latest, 12);
  const sched = (r: Rule) => occurrences(scheduleOnly(r), "0000-01-01", until).map((o) => ({ date: o.date, amount: o.amount }));
  const a = sched(before);
  const b = sched(after);
  const postedA = a.filter((x) => x.date <= today);
  const postedB = b.filter((x) => x.date <= today);
  const lost = postedA.filter((x) => !postedB.some((y) => y.date === x.date));
  const gained = postedB.filter((x) => !postedA.some((y) => y.date === x.date));
  const pairs = Math.min(lost.length, gained.length);
  const moved = Array.from({ length: pairs }, (_, i) => ({ from: lost[i]!.date, to: gained[i]!.date }));
  const changedPast = postedA.filter((x) => postedB.some((y) => y.date === x.date && y.amount !== x.amount)).length;
  const futureA = a.filter((x) => x.date > today);
  const futureB = b.filter((x) => x.date > today);
  let changedFuture = 0;
  for (let i = 0; i < Math.max(futureA.length, futureB.length); i++) {
    const x = futureA[i];
    const y = futureB[i];
    if (!x || !y || x.date !== y.date || x.amount !== y.amount) changedFuture++;
  }
  const kept = (r: Rule) => (r.skipped?.length ?? 0) + Object.keys(r.overrides ?? {}).length;
  const reset = kept(before) - kept(after);
  const addedPast = gained.slice(pairs);
  const removedPast = lost.slice(pairs);
  const postedMove = moved.length > 0 || addedPast.length > 0 || removedPast.length > 0;
  return { addedPast, removedPast, moved, changedPast, changedFuture, reset, postedMove, unchanged: !postedMove && changedPast === 0 && changedFuture === 0 && reset === 0 };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function dateList(ds: IsoDate[]): string {
  const xs = ds.slice(0, ds.length > 4 ? 3 : 4).map(labelShort);
  if (ds.length > 4) return `${xs.join(", ")} and ${ds.length - 3} more`;
  return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "";
}

/** The preview in words. `card` names the card when the plan is on one. */
export function diffLines(d: PlanDiff, opts: { fmt: (m: Minor) => string; card?: string }): string[] {
  if (d.unchanged) return ["No payments change."];
  const out: string[] = [];
  if (d.addedPast.length) {
    const n = d.addedPast.length;
    out.push(`Adds ${plural(n, "payment", "payments")} in the past: ${dateList(d.addedPast.map((x) => x.date))}, ${opts.fmt(d.addedPast.reduce((s, x) => s + x.amount, 0))} in all. ${n === 1 ? "It" : "They"} will count in Spent${opts.card ? ` and on ${opts.card}'s bills` : ""}.`);
  }
  if (d.removedPast.length) {
    const n = d.removedPast.length;
    out.push(`Removes ${plural(n, "payment", "payments")} already posted: ${dateList(d.removedPast.map((x) => x.date))}. ${n === 1 ? "It leaves" : "They leave"} your Ledger and Spent.`);
  }
  if (d.moved.length) out.push(`Moves ${plural(d.moved.length, "payment", "payments")}. The first is ${labelShort(d.moved[0]!.from)}, now ${labelShort(d.moved[0]!.to)}.`);
  if (d.changedPast) out.push(`Changes the amount of ${plural(d.changedPast, "payment", "payments")} already posted.`);
  if (d.changedFuture) out.push(`Changes ${plural(d.changedFuture, "payment", "payments")} that ${d.changedFuture === 1 ? "has" : "have"} not happened yet.`);
  if (d.reset) out.push(`${plural(d.reset, "edited or skipped payment", "edited or skipped payments")} will reset.`);
  if (d.postedMove) out.push("Payments already made move too.");
  return out;
}
