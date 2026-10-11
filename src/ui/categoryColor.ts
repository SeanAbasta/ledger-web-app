// A fixed colour per category, the same everywhere (Ledger row dots, the Dashboard donut and legend).
// Nothing is stored: common names have a set colour, any other name always hashes to the same one.
// The tones are CSS variables (Apple's system colours, light and dark) applied through `.tone-<name>`.

export const TONES = ["blue", "orange", "green", "purple", "pink", "teal", "yellow", "indigo", "red", "mint", "cyan", "brown", "gray"] as const;
export type Tone = (typeof TONES)[number];

const NAMED: Record<string, Tone> = {
  food: "orange",
  groceries: "mint",
  coffee: "brown",
  transport: "blue",
  travel: "green",
  shopping: "purple",
  bills: "teal",
  utilities: "teal",
  rent: "brown",
  health: "pink",
  fun: "yellow",
  entertainment: "yellow",
  gaming: "indigo",
  education: "indigo",
  subscriptions: "cyan",
  gifts: "red",
  salary: "green",
  other: "gray",
  others: "gray",
  settlement: "gray",
  "card payment": "gray",
};

/** Grey is kept for "Other" and money moves, so a named category never hashes to it. */
const HASHED = TONES.filter((t) => t !== "gray");

export function categoryTone(category?: string): Tone {
  const key = (category ?? "").trim().toLowerCase();
  if (!key) return "gray";
  const named = NAMED[key];
  if (named) return named;
  let h = 2166136261; // FNV-1a
  for (const ch of key) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return HASHED[(h >>> 0) % HASHED.length]!;
}
