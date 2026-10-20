import { describe, expect, it } from "vitest";
import type { SplitMode } from "../src/data/schema";
import { MODE_LABEL, modeLabel } from "../src/ui/splitLabels";

const MODES: SplitMode[] = ["they-owe", "i-owe", "half", "custom"];

describe("split mode labels", () => {
  it("names every mode", () => {
    for (const m of MODES) expect(modeLabel(m)).toBeTruthy();
  });
  it("reads half as Even", () => {
    expect(modeLabel("half")).toBe("Even");
  });
  it("has no stray keys", () => {
    expect(Object.keys(MODE_LABEL).sort()).toEqual([...MODES].sort());
  });
});
