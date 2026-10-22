import { describe, expect, it } from "vitest";
import { loadShortcutsOn, saveShortcutsOn, shortcutFor } from "../src/ui/shortcuts";

const k = (key: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, repeat: false, typing: false, sheetOpen: false, ...extra });
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (x: string) => m.get(x) ?? null, setItem: (x: string, v: string) => void m.set(x, v), removeItem: (x: string) => void m.delete(x) };
};

describe("shortcutFor", () => {
  it("maps N, slash, the brackets and T", () => {
    expect(shortcutFor(k("n"), true)).toBe("new");
    expect(shortcutFor(k("N"), true)).toBe("new");
    expect(shortcutFor(k("/"), true)).toBe("search");
    expect(shortcutFor(k("["), true)).toBe("prev");
    expect(shortcutFor(k("]"), true)).toBe("next");
    expect(shortcutFor(k("t"), true)).toBe("today");
    expect(shortcutFor(k("x"), true)).toBeNull();
  });
  it("ignores typing in a field, a modifier, a held key and an open sheet", () => {
    expect(shortcutFor(k("n", { typing: true }), true)).toBeNull();
    expect(shortcutFor(k("n", { metaKey: true }), true)).toBeNull();
    expect(shortcutFor(k("n", { ctrlKey: true }), true)).toBeNull();
    expect(shortcutFor(k("n", { altKey: true }), true)).toBeNull();
    expect(shortcutFor(k("n", { repeat: true }), true)).toBeNull();
    expect(shortcutFor(k("n", { sheetOpen: true }), true)).toBeNull();
  });
  it("does nothing when switched off", () => {
    expect(shortcutFor(k("n"), false)).toBeNull();
    expect(shortcutFor(k("t"), false)).toBeNull();
  });
});

describe("the Off switch", () => {
  it("is on by default and remembers off", () => {
    const s = mem();
    expect(loadShortcutsOn(s)).toBe(true);
    saveShortcutsOn(false, s);
    expect(loadShortcutsOn(s)).toBe(false);
    saveShortcutsOn(true, s);
    expect(loadShortcutsOn(s)).toBe(true);
  });
});
