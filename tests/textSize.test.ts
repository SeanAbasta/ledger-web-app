import { describe, expect, it } from "vitest";
import { loadTextSize, parseTextSize, saveTextSize } from "../src/ui/textSize";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("text size", () => {
  it("defaults to default and ignores junk", () => {
    expect(loadTextSize(mem())).toBe("default");
    expect(parseTextSize("huge")).toBe("default");
    expect(parseTextSize("large")).toBe("large");
    expect(parseTextSize("larger")).toBe("larger");
  });
  it("round-trips through storage", () => {
    const s = mem();
    expect(saveTextSize("larger", s)).toBe(true);
    expect(loadTextSize(s)).toBe("larger");
  });
  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadTextSize(blocked)).toBe("default");
    expect(saveTextSize("large", blocked)).toBe(false);
  });
});
