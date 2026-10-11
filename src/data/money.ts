// Money is always an integer in minor units (centavos, cents). Never a float.

const MINOR_DIGITS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

/** Parse user input like "1,250.5" into minor units. Returns null if invalid. */
export function parseMinor(input: string, currency = "PHP"): number | null {
  const digits = minorDigits(currency);
  const clean = input.trim().replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d*))?$/.exec(clean);
  if (!m) return null;
  const whole = m[1] ?? "0";
  const frac = m[2] ?? "";
  if (frac.length > digits) return null;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
}

const SYMBOL: Record<string, string> = { PHP: "₱", USD: "$", EUR: "€", JPY: "¥", GBP: "£", SGD: "S$" };

/** The pieces of a formatted amount, so big figures can draw the symbol and the cents smaller. */
export interface MoneyParts {
  sign: "" | "-";
  symbol: string;
  /** Whole units with thousands separators. */
  whole: string;
  /** "" for currencies without minor units, else "." and the minor digits. */
  cents: string;
}

export function moneyParts(minor: number, currency = "PHP"): MoneyParts {
  const digits = minorDigits(currency);
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 10 ** digits);
  const frac = digits ? String(abs % 10 ** digits).padStart(digits, "0") : "";
  return {
    sign: minor < 0 ? "-" : "",
    symbol: SYMBOL[currency] ?? currency + " ",
    whole: whole.toLocaleString("en-US"),
    cents: digits ? "." + frac : "",
  };
}

export function formatMinor(minor: number, currency = "PHP"): string {
  const p = moneyParts(minor, currency);
  return `${p.sign}${p.symbol}${p.whole}${p.cents}`;
}

/**
 * Convert minor units using a decimal rate string (e.g. "56.25" PHP per 1 USD).
 * Integer math on a scaled rate, rounded half away from zero.
 */
export function convertMinor(minor: number, rate: string, fromCurrency: string, toCurrency: string): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!m) throw new Error(`Invalid rate: ${rate}`);
  const frac = m[2] ?? "";
  const scaled = BigInt((m[1] ?? "0") + frac); // rate * 10^frac.length
  const shift = minorDigits(toCurrency) - minorDigits(fromCurrency);
  let num = BigInt(minor) * scaled;
  let den = 10n ** BigInt(frac.length);
  if (shift >= 0) num *= 10n ** BigInt(shift);
  else den *= 10n ** BigInt(-shift);
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = (a * 2n + den) / (den * 2n); // round half up on magnitude
  return Number(neg ? -q : q);
}

/** Split an amount into n shares that sum exactly; remainder goes to the first shares. */
export function splitEvenly(minor: number, n: number): number[] {
  if (n < 1) throw new Error("n must be >= 1");
  const base = Math.floor(minor / n);
  const rem = minor - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
