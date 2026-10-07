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

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
const W = 720;
const PAD = 40;
const ROW = 40;

const owes = (name: string, amt: number) => (amt > 0 ? `${name} owes you` : `You owe ${name}`);

/** Draw the statement as a PNG. Light, flat, one accent: a clean card to show someone. */
export function renderStatement(m: StatementModel, scale = 2): Promise<Blob> {
  const rows = m.lines.length + (m.earlier.length ? m.earlier.length : 0);
  const H = PAD + 92 + Math.max(rows, 1) * ROW + 40 + m.net.length * 64 + 56;
  const c = document.createElement("canvas");
  c.width = W * scale;
  c.height = H * scale;
  const g = c.getContext("2d");
  if (!g) return Promise.reject(new Error("Canvas not supported"));
  g.scale(scale, scale);

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#e9efff");
  bg.addColorStop(1, "#fdeef4");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.fillStyle = "rgba(255,255,255,0.88)";
  g.beginPath();
  g.roundRect(20, 20, W - 40, H - 40, 24);
  g.fill();

  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", max?: number) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    let t = s;
    if (max) while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -2) + "…";
    g.fillText(t, x, y);
  };

  let y = PAD + 28;
  text(m.name, PAD + 8, y, `600 30px ${FONT}`, "#1d1d1f");
  y += 26;
  text(`Statement · ${labelShort(m.asOf)}, ${m.asOf.slice(0, 4)}`, PAD + 8, y, `400 15px ${FONT}`, "#6e6e73");
  y += 22;

  const line = () => {
    g.strokeStyle = "rgba(0,0,0,0.08)";
    g.beginPath();
    g.moveTo(PAD + 8, y);
    g.lineTo(W - PAD - 8, y);
    g.stroke();
  };
  line();

  const right = W - PAD - 8;
  for (const [cur, amt] of m.earlier) {
    y += ROW;
    text("Earlier balance", PAD + 8, y - 14, `400 16px ${FONT}`, "#6e6e73");
    text(formatMinor(amt, cur), right, y - 14, `400 16px ${FONT}`, "#6e6e73", "right");
  }
  if (m.lines.length === 0 && m.earlier.length === 0) {
    y += ROW;
    text("Nothing owed", PAD + 8, y - 14, `400 16px ${FONT}`, "#6e6e73");
  }
  for (const l of m.lines) {
    y += ROW;
    text(labelShort(l.date), PAD + 8, y - 14, `400 15px ${FONT}`, "#6e6e73");
    text(l.label, PAD + 84, y - 14, `400 16px ${FONT}`, "#1d1d1f", "left", 360);
    text(formatMinor(l.amount, l.currency), right, y - 14, `500 16px ${FONT}`, l.amount < 0 ? "#2fb457" : "#1d1d1f", "right");
  }

  y += 16;
  line();
  for (const [cur, amt] of m.net) {
    y += 56;
    text(owes(m.name, amt), PAD + 8, y - 16, `500 18px ${FONT}`, "#1d1d1f");
    text(formatMinor(Math.abs(amt), cur), right, y - 14, `600 28px ${FONT}`, "#0a84ff", "right");
  }
  text("Ledger", W / 2, H - 34, `400 12px ${FONT}`, "#a1a1a6", "center");

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
