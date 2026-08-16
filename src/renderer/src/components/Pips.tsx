/**
 * Segmented pip bars, LCD-toy style rather than smooth progress bars.
 * Discrete blocks read as pixel art for free, and they make "one care action
 * moved this" legible at a glance in a way a fluid fill never is.
 */
export function Pips({
  value,
  max,
  tone,
  label,
  compact = false
}: {
  value: number
  max: number
  tone: 'health' | 'hunger'
  label: string
  compact?: boolean
}): React.JSX.Element {
  const filled = Math.min(max, Math.max(0, Math.ceil(value)))
  return (
    <div className={`pips${compact ? ' pips-compact' : ''}`}>
      {!compact && <span className="pips-label">{label}</span>}
      <div
        className="pips-track"
        role="img"
        aria-label={`${label}: ${filled} of ${max}`}
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`pip pip-${tone}${i < filled ? ' is-on' : ' hatch'}`}
          />
        ))}
      </div>
    </div>
  )
}
