import { describe, expect, it } from "vitest";
import { dropSheet, isTopSheet, pushSheet, topSheet } from "../src/ui/sheetStack";

describe("sheetStack", () => {
  it("puts the newest sheet on top", () => {
    const s = pushSheet(pushSheet([], "a"), "b");
    expect(topSheet(s)).toBe("b");
    expect(isTopSheet(s, "b")).toBe(true);
    expect(isTopSheet(s, "a")).toBe(false);
  });
  it("gives the top back to the one below when the top closes", () => {
    const s = dropSheet(pushSheet(pushSheet([], "a"), "b"), "b");
    expect(topSheet(s)).toBe("a");
  });
  it("keeps the order when a sheet below the top closes", () => {
    const s = dropSheet(pushSheet(pushSheet(pushSheet([], "a"), "b"), "c"), "b");
    expect(s).toEqual(["a", "c"]);
    expect(topSheet(s)).toBe("c");
  });
  it("has no top when empty", () => {
    expect(topSheet([])).toBeUndefined();
    expect(isTopSheet([], "a")).toBe(false);
    expect(topSheet(dropSheet(["a"], "a"))).toBeUndefined();
  });
  it("never lists a sheet twice", () => {
    expect(pushSheet(["a", "b"], "a")).toEqual(["b", "a"]);
  });
});
