export function Segmented<T extends string>({ value, options, onChange, labels }: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <span className="seg" role="tablist">
      {options.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </span>
  );
}
