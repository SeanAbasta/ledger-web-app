import { useEffect, useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { minorDigits } from "../data/money";
import { formatMoney, reformat, unformat } from "./moneyFormat";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> & {
  /** Plain amount as stored in state, no commas: "1250.5". */
  value: string;
  onChange: (plain: string) => void;
  currency: string;
  allowNegative?: boolean;
};

/** A text box that shows an amount with thousands separators as you type. Callers still hold the plain string. */
export function MoneyInput({ value, onChange, currency, allowNegative, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const opts = { decimals: minorDigits(currency), negative: allowNegative };
  const display = formatMoney(value, opts);

  // A controlled input would jump the cursor to the end after every re-render; put it back.
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current) {
      ref.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  // Keep the caller's string clean: this trims decimals when the currency changes to one with fewer.
  useEffect(() => {
    const clean = unformat(display);
    if (clean !== value) onChange(clean);
  }, [display, value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={(e) => {
        const el = e.target;
        const r = reformat(el.value, el.selectionStart ?? el.value.length, opts);
        const plain = unformat(r.value);
        if (plain === value) {
          // Nothing changed (a rejected key), so React will not re-render: put the text and cursor back by hand.
          el.value = r.value;
          el.setSelectionRange(r.caret, r.caret);
          return;
        }
        caret.current = r.caret;
        onChange(plain);
      }}
    />
  );
}
