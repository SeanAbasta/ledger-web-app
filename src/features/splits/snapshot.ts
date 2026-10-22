import { labelShort } from "../../data/dates";
import { formatMinor } from "../../data/money";
import type { Line } from "../../data/balances";

export interface StatementModel {
  name: string;
  asOf: string; // ISO date
  earlier: [string, number][]; // carried balance per currency
  lines: Line[];
  net: [string, number][];
}

// The app's own faces (self-hosted): Hanken Grotesk for rows, Spectral for the name and figures. Each falls
// back to the system font or Georgia if it has not loaded.
const FONT = '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const FIG = '"Spectral", Georgia, "Times New Roman", serif';
const W = 720;
const PAD = 40;
const ROW = 40;
const HEAD = 30;
// Always the light theme's paper and ink: the image is made to be shown to someone else.
const PAPER = "#f9fafb";
const INK = "#0b0c0f";
const MUTE = "#5a6275";
const GREEN = "#12724c";
const ACCENT = "#1a34e8";
// Columns: date, item, then Total and Your share right aligned. The item gets about 298 px, so a name of
// about 28 characters fits at 16 px (measured: 225 to 268 px, all capitals the widest) and longer ones end in "…".
const X_DATE = PAD + 8;
const X_ITEM = PAD + 84;
const X_SHARE = W - PAD - 8;
const X_TOTAL = X_SHARE - 130;
const ITEM_MAX = X_TOTAL - 120 - X_ITEM;

const owes = (name: string, amt: number) => (amt > 0 ? `${name} owes you` : `You owe ${name}`);

/** Wait (briefly) for the faces the image uses, so a first snapshot is not drawn in the fallback font. */
async function fontsReady(): Promise<void> {
  const f = typeof document !== "undefined" ? document.fonts : undefined;
  if (!f) return;
  const wanted = ["300 30px Spectral", "300 28px Spectral", "400 16px \"Hanken Grotesk\"", "500 16px \"Hanken Grotesk\""].map((x) => f.load(x, "0123456789\u20b1Aa"));
  await Promise.race([Promise.all(wanted), new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
}

/**
 * Draw the statement as a PNG: paper, ink and one accent, ruled like the app. Always light, in either theme,
 * since it is made to be shown to someone else. Each expense shows what it cost in full next to the person's
 * share, so a share is never mistaken for the whole bill.
 */
export async function renderStatement(m: StatementModel, scale = 2): Promise<Blob> {
  await fontsReady();
  const rows = m.lines.length + (m.earlier.length ? m.earlier.length : 0);
  const H = PAD + 92 + HEAD + Math.max(rows, 1) * ROW + 40 + m.net.length * 64 + 56;
  const c = document.createElement("canvas");
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext("2d");
  if (!g) return Promise.reject(new Error("Canvas not supported"));
  g.scale(scale, scale);

  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", max?: number) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    let t = s;
    if (max) while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + "…";
    g.fillText(t, x, y);
  };

  let y = PAD + 28;
  text(m.name, PAD + 8, y, `300 30px ${FIG}`, INK);
  y += 26;
  text(`Statement · ${labelShort(m.asOf)}, ${m.asOf.slice(0, 4)}`, PAD + 8, y, `400 15px ${FONT}`, MUTE);
  y += 22;

  const line = () => {
    g.strokeStyle = "rgba(11,12,15,0.14)";
    g.beginPath();
    g.moveTo(PAD + 8, y);
    g.lineTo(W - PAD - 8, y);
    g.stroke();
  };

  // Column labels.
  y += HEAD;
  const head = `500 13px ${FONT}`;
  text("Date", X_DATE, y - 10, head, MUTE);
  text("Item", X_ITEM, y - 10, head, MUTE);
  text("Total", X_TOTAL, y - 10, head, MUTE, "right");
  text("Your share", X_SHARE, y - 10, head, MUTE, "right");
  line();

  for (const [cur, amt] of m.earlier) {
    y += ROW;
    text("Earlier balance", X_DATE, y - 14, `400 16px ${FONT}`, MUTE);
    text(formatMinor(amt, cur), X_SHARE, y - 14, `300 18px ${FIG}`, MUTE, "right");
  }
  if (m.lines.length === 0 && m.earlier.length === 0) {
    y += ROW;
    text("Nothing owed", X_DATE, y - 14, `400 16px ${FONT}`, MUTE);
  }
  for (const l of m.lines) {
    y += ROW;
    text(labelShort(l.date), X_DATE, y - 14, `400 15px ${FONT}`, MUTE);
    text(l.label, X_ITEM, y - 14, `400 16px ${FONT}`, INK, "left", ITEM_MAX);
    if (l.total !== undefined) text(formatMinor(l.total, l.currency), X_TOTAL, y - 14, `300 17px ${FIG}`, MUTE, "right");
    // A part payment ("Paid") shows with its sign, quietly; it is not a share of anything.
    if (l.settlement) text(`${l.amount < 0 ? "\u2212" : "+"}${formatMinor(Math.abs(l.amount), l.currency)}`, X_SHARE, y - 14, `300 18px ${FIG}`, MUTE, "right");
    else text(formatMinor(l.amount, l.currency), X_SHARE, y - 14, `300 18px ${FIG}`, l.amount < 0 ? GREEN : INK, "right");
  }

  y += 16;
  line();
  for (const [cur, amt] of m.net) {
    y += 56;
    text(owes(m.name, amt), PAD + 8, y - 16, `500 18px ${FONT}`, INK);
    text(formatMinor(Math.abs(amt), cur), X_SHARE, y - 14, `300 30px ${FIG}`, ACCENT, "right");
  }
  text("Ledger", W / 2, H - 34, `400 14px ${FIG}`, MUTE, "center");

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not render image"))), "image/png"));
}

/** Copy the PNG to the clipboard where supported. Returns false if not possible. */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
