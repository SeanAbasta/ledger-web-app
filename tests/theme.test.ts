import { describe, expect, it } from "vitest";
import { loadTheme, parseTheme, resolveTheme, saveTheme } from "../src/ui/theme";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("theme", () => {
  it("defaults to light and ignores junk", () => {
    expect(loadTheme(mem())).toBe("light");
    expect(parseTheme("purple")).toBe("light");
    expect(parseTheme(undefined)).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("auto")).toBe("auto");
  });
  it("round-trips through storage", () => {
    const s = mem();
    expect(saveTheme("dark", s)).toBe(true);
    expect(loadTheme(s)).toBe("dark");
    saveTheme("auto", s);
    expect(loadTheme(s)).toBe("auto");
  });
  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(loadTheme(blocked)).toBe("light");
    expect(saveTheme("dark", blocked)).toBe(false);
    expect(saveTheme("dark", undefined)).toBe(false);
  });
  it("resolves auto from the system, and explicit choices ignore it", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
