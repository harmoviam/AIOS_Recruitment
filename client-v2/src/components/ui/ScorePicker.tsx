export default function ScorePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="score-picker" role="radiogroup" aria-label={`${label} score`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={`score-dot${value === n ? ' active' : ''}`}
          onClick={() => onChange(value === n ? null : n)}
          disabled={disabled}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
