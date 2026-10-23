/**
 * The Daily calendar is one tab stop, and the arrow keys move inside it (a roving tab stop). Where a key
 * lands: Left and Right to the next day that can take focus in that direction, Up and Down to the same
 * weekday a week earlier or later, Home and End to the first and last. `ok(i)` says whether day `i` is a
 * button. Undefined when the key moves nowhere.
 */
export function roveTo(key: string, from: number, count: number, ok: (i: number) => boolean): number | undefined {
  if (key === "Home" || key === "End") {
    for (let k = 0; k < count; k++) {
      const i = key === "Home" ? k : count - 1 - k;
      if (ok(i)) return i === from ? undefined : i;
    }
    return undefined;
  }
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : key === "ArrowDown" ? 7 : key === "ArrowUp" ? -7 : 0;
  if (!step) return undefined;
  for (let i = from + step; i >= 0 && i < count; i += step) if (ok(i)) return i;
  return undefined;
}
