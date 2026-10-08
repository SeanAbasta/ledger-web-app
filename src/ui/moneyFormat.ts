// Display formatting for amounts typed into a field: "1234567.8" shows as "1,234,567.8".
// Pure, so it can be tested without a DOM. Callers keep the plain string (no commas) in their
// state, so parseMinor and every save path are unchanged.
//
// A typed "," is ignored: here it is the thousands separator. Keyboards that use "," as the
// decimal mark are out of scope for this PHP-first app.

export interface Options {
  /** Digits allowed after the point (the currency's minor digits: 2 for PHP, 0 for JPY). */
  decimals: number;
  /** Allow a leading minus (account opening balances). */
  negative?: boolean;
}

export interface Result {
  value: string;
  /** Where the cursor belongs in `value`. */
  caret: number;
}

const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Clean and group what the user typed or pasted. `caret` is the cursor position in `typed`;
 * the returned caret sits after the same digits, so the cursor does not jump when commas appear.
 */
export function reformat(typed: string, caret: number, o: Options): Result {
  // 1. Keep sign, digits and one point; count how many kept characters sit left of the cursor.
  let sign = "";
  let int = "";
  let frac = "";
  let dot = false;
  let before = 0; // kept characters left of the cursor, in "clean" coordinates
  for (let i = 0; i < typed.length; i++) {
    const ch = typed[i]!;
    let kept = false;
    if (ch === "-" && o.negative && !sign && !int && !dot) {
      sign = "-";
      kept = true;
    } else if (ch >= "0" && ch <= "9") {
      if (!dot) {
        int += ch;
        kept = true;
      } else if (frac.length < o.decimals) {
        frac += ch;
        kept = true;
      }
    } else if (ch === "." && !dot) {
      // Seen even when the currency has no decimals: everything after it is then dropped, so
      // "1,250.50" in a JPY field becomes 1,250 and not 125,050.
      dot = true;
      kept = o.decimals > 0;
    }
    if (kept && i < caret) before++;
  }

  // 2. Leading zeros: "007" becomes "7", "0" stays; a lone "." becomes "0.".
  let lead = 0;
  while (int.length - lead > 1 && int[lead] === "0") lead++;
  if (lead) {
    int = int.slice(lead);
    const start = sign.length;
    before = before <= start ? before : before < start + lead ? start : before - lead;
  }
  if (!int && dot && o.decimals > 0) {
    int = "0";
    if (before > sign.length) before++;
  }

  // 3. Group the integer part and find the cursor again by counting characters that are not commas.
  const grouped = group(int);
  const value = sign + grouped + (dot && o.decimals > 0 ? "." + frac : "");
  let seen = 0;
  let pos = 0;
  while (pos < value.length && seen < before) {
    if (value[pos] !== ",") seen++;
    pos++;
  }
  return { value, caret: pos };
}

/** What gets stored in state: the display with its commas removed. */
export const unformat = (display: string) => display.replace(/,/g, "");

/** Display text for a plain stored value, e.g. "766695.75" to "766,695.75". */
export const formatMoney = (plain: string, o: Options): string => reformat(plain, plain.length, o).value;
