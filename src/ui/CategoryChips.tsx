import { categoryChips } from "./categoryChipList";

/** Category as a wrapping row of tap chips (same look as People), one of them picked. */
export function CategoryChips({ list, value, onChange }: { list: readonly string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="picks" role="radiogroup" aria-label="Category">
      {categoryChips(list, value).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} className={c === value ? "pick on" : "pick"} onClick={() => onChange(c)}>{c}</button>
      ))}
    </div>
  );
}
