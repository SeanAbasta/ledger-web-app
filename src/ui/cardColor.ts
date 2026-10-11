import { isCard, type Account } from "../data/schema";

// Card faces on the Dashboard, like Apple Wallet: one colour per credit card, picked in Settings.
// The key is stored on the card (`Account.color`); the gradients live in tokens.css (`.face-<key>`).

export const CARD_COLORS = ["blue", "green", "purple", "orange", "red", "pink", "teal", "graphite"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_COLOR_LABEL: Record<CardColor, string> = {
  blue: "Blue", green: "Green", purple: "Purple", orange: "Orange", red: "Red", pink: "Pink", teal: "Teal", graphite: "Graphite",
};

const known = (v: unknown): v is CardColor => (CARD_COLORS as readonly unknown[]).includes(v);

/**
 * The card's colour: the one picked in Settings, else one by the card's place among `accounts`' cards
 * in the order they were added (ids are ULIDs, so sorting them is creation order). A key this copy
 * does not know falls back the same way.
 */
export function cardColor(card: Account, accounts: Account[]): CardColor {
  if (known(card.color)) return card.color;
  const order = accounts.filter((a) => isCard(a) && !a.deleted).map((a) => a.id).sort();
  const i = order.indexOf(card.id);
  return CARD_COLORS[Math.max(0, i) % CARD_COLORS.length]!;
}
