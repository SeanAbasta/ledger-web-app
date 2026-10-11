import { moneyParts } from "../data/money";

/**
 * A big figure (Spent, a card's due, balances): rounded digits with the currency sign and the
 * cents drawn smaller and lighter. The text is the same as formatMinor, so it reads and copies
 * the same. `word` shows a word instead ("Paid", "No data").
 */
export function BigAmount({ minor, currency, word, className }: { minor?: number; currency: string; word?: string; className?: string }) {
  const cls = (...c: (string | undefined)[]) => c.filter(Boolean).join(" ");
  if (word !== undefined || minor === undefined) return <div className={cls("big", "word", className)}>{word}</div>;
  const p = moneyParts(minor, currency);
  return (
    <div className={cls("big", className)}>
      {p.sign}<span className="cur">{p.symbol}</span>{p.whole}{p.cents && <span className="cents">{p.cents}</span>}
    </div>
  );
}
