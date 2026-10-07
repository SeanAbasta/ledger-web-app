import { serialize } from "./serialize";
import type { Doc } from "./db";

/** A whole data set as one file, used for exports and for saving the losing side of a conflict. */
export interface Bundle {
  format: "ledger-export";
  version: 1;
  exportedAt: string;
  files: Record<string, Doc>;
}

export const makeBundle = (files: Record<string, Doc>, now = new Date()): Bundle => ({ format: "ledger-export", version: 1, exportedAt: now.toISOString(), files });

export const bundleText = (b: Bundle) => serialize(b);

export function parseBundle(text: string): Bundle {
  const b = JSON.parse(text) as Partial<Bundle>;
  if (b.format !== "ledger-export" || b.version !== 1 || !b.files || typeof b.files !== "object") throw new Error("Not a Ledger export");
  return b as Bundle;
}
