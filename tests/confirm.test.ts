import { describe, expect, it } from "vitest";
import { GUARD_MS, IDLE, confirmLabel, confirmStep } from "../src/ui/confirm";

describe("confirmStep", () => {
  it("arms on the first tap without acting", () => {
    expect(confirmStep(IDLE, { type: "tap", now: 1000 })).toEqual({ state: { armed: true, at: 1000 }, act: false });
  });
  it("acts on a second tap and goes back to idle", () => {
    const armed = confirmStep(IDLE, { type: "tap", now: 1000 }).state;
    expect(confirmStep(armed, { type: "tap", now: 2000 })).toEqual({ state: IDLE, act: true });
  });
  it("disarms on timeout", () => {
    const armed = confirmStep(IDLE, { type: "tap", now: 1000 }).state;
    expect(confirmStep(armed, { type: "timeout" })).toEqual({ state: IDLE, act: false });
  });
  it("disarms on a tap elsewhere", () => {
    const armed = confirmStep(IDLE, { type: "tap", now: 1000 }).state;
    expect(confirmStep(armed, { type: "blur" })).toEqual({ state: IDLE, act: false });
  });
  it("stays idle on timeout and blur", () => {
    expect(confirmStep(IDLE, { type: "timeout" })).toEqual({ state: IDLE, act: false });
    expect(confirmStep(IDLE, { type: "blur" })).toEqual({ state: IDLE, act: false });
  });
  it("ignores a second tap that lands too soon after arming (a double tap)", () => {
    const armed = confirmStep(IDLE, { type: "tap", now: 1000 }).state;
    const quick = confirmStep(armed, { type: "tap", now: 1000 + GUARD_MS - 1 });
    expect(quick).toEqual({ state: armed, act: false });
    expect(confirmStep(quick.state, { type: "tap", now: 1000 + GUARD_MS }).act).toBe(true);
  });
});

describe("confirmLabel", () => {
  it("names the item by its note, else its category", () => {
    expect(confirmLabel("delete", { note: "Coffee", category: "Food" })).toBe("Delete Coffee?");
    expect(confirmLabel("delete", { category: "Food" })).toBe("Delete Food?");
    expect(confirmLabel("delete", {})).toBe("Delete this?");
  });
  it("names the payment's date for Skip and End series", () => {
    expect(confirmLabel("skip", { date: "2026-10-25" })).toBe("Skip Oct 25?");
    expect(confirmLabel("end", { date: "2026-10-25" })).toBe("End before Oct 25?");
  });
});
