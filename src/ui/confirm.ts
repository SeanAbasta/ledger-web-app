import { labelShort } from "../data/dates";

/**
 * A button that acts on a second tap. The first tap arms it (its label asks), a second tap acts,
 * and a timeout or a tap anywhere else disarms it. A second tap within `GUARD_MS` of arming is
 * ignored, so a quick double tap on a phone never acts at once.
 */
export const CONFIRM_MS = 4000;
export const GUARD_MS = 300;

export type ConfirmState = { armed: false } | { armed: true; at: number };
export type ConfirmEvent = { type: "tap"; now: number } | { type: "timeout" } | { type: "blur" };

export const IDLE: ConfirmState = { armed: false };

export function confirmStep(state: ConfirmState, event: ConfirmEvent): { state: ConfirmState; act: boolean } {
  if (event.type !== "tap") return { state: IDLE, act: false };
  if (!state.armed) return { state: { armed: true, at: event.now }, act: false };
  if (event.now - state.at < GUARD_MS) return { state, act: false };
  return { state: IDLE, act: true };
}

/** What an armed button asks. Delete names the item (note, else category); Skip and End name the payment's date. */
export function confirmLabel(action: "delete" | "skip" | "end", item: { note?: string; category?: string; date?: string }): string {
  if (action === "delete") return `Delete ${item.note || item.category || "this"}?`;
  const d = item.date ? labelShort(item.date) : "";
  // End series stops the plan the day before this payment, so this payment goes too.
  return action === "skip" ? `Skip ${d}?` : `End before ${d}?`;
}
