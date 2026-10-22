import { moneyParts } from "../data/money";

/**
 * A big figure (Spent, a card's due, balances): rounded digits with the currency sign and the
 * cents drawn smaller and lighter. The text is the same as formatMinor, so it reads and copies
 * the same. `word` shows a word instead ("Paid", "No data"). `sign` goes before it ("+" or "−" on Year Net).
 */
export function BigAmount({ minor, currency, word, className, sign }: { minor?: number; currency: string; word?: string; className?: string; sign?: string }) {
  const cls = (...c: (string | undefined)[]) => c.filter(Boolean).join(" ");
  if (word !== undefined || minor === undefined) return <div className={cls("big", "word", className)}>{word}</div>;
  const p = moneyParts(minor, currency);
  // A figure over 11 characters steps down one size (the hero, in CSS), so it never wraps or clips.
  const long = `${sign ?? ""}${p.sign}${p.symbol}${p.whole}${p.cents ?? ""}`.length > 11;
  return (
    <div className={cls("big", long ? "long" : undefined, className)}>
      {sign}{p.sign}<span className="cur">{p.symbol}</span>{p.whole}{p.cents && <span className="cents">{p.cents}</span>}
    </div>
  );
}
