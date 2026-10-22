import { useState } from "react";
import { categoryChips, visibleChips } from "./categoryChipList";

/**
 * Category as a wrapping row of tap chips (same look as People), one of them picked. `compact` (the Add
 * tab) shows the picked chip and three more, then More, which opens the whole list in place.
 */
export function CategoryChips({ list, value, onChange, compact }: { list: readonly string[]; value: string; onChange: (c: string) => void; compact?: boolean }) {
  const [all, setAll] = useState(false);
  const { shown, more } = compact && !all ? visibleChips(list, value) : { shown: categoryChips(list, value), more: 0 };
  return (
    <div className="picks" role="radiogroup" aria-label="Category">
      {shown.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} className={c === value ? "pick on" : "pick"} onClick={() => onChange(c)}>{c}</button>
      ))}
      {more > 0 && <button type="button" className="pick more" aria-expanded={false} aria-label={`More categories, ${more} more`} onClick={() => setAll(true)}>More</button>}
    </div>
  );
}
