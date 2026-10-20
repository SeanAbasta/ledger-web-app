/**
 * Open sheets, oldest first. Only the top one answers Escape, so a sheet opened from another
 * (Refund from Edit expense) closes alone. Pure helpers; `Sheet.tsx` keeps the one shared list.
 */
export type SheetStack = readonly string[];

export const pushSheet = (s: SheetStack, id: string): SheetStack => [...s.filter((x) => x !== id), id];
export const dropSheet = (s: SheetStack, id: string): SheetStack => s.filter((x) => x !== id);
export const topSheet = (s: SheetStack): string | undefined => s[s.length - 1];
export const isTopSheet = (s: SheetStack, id: string): boolean => topSheet(s) === id;
