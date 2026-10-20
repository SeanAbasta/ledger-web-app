import type { SplitMode } from "../data/schema";

/** How each split mode reads on screen. "half" divides evenly among everyone, me included, so it reads "Even". */
export const MODE_LABEL: Record<SplitMode, string> = { "they-owe": "They owe", "i-owe": "I owe", half: "Even", custom: "Custom" };

export const modeLabel = (mode: SplitMode): string => MODE_LABEL[mode];
