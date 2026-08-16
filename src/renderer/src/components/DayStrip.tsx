import type { DaySlotState } from '@shared/types'

/**
 * Today at a glance, in half-hour slots.
 *
 * The diagonal hatch means "away" here and everywhere else in the app — one
 * motif, one meaning. Away is drawn as absence rather than as failure: there
 * is no red, and no bar for "wasted".
 */
export function DayStrip({
  slots
}: {
  slots: Array<{ at: number; state: DaySlotState }>
}): React.JSX.Element {
  const labels = [9, 11, 13, 15, 17, 19, 21]

  return (
    <div>
      <div className="daystrip">
        {slots.map((slot) => (
          <span
            key={slot.at}
            className={`daystrip-slot is-${slot.state}`}
            title={`${new Date(slot.at).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit'
            })} — ${slot.state}`}
          />
        ))}
      </div>

      <div className="daystrip-axis">
        {labels.map((h) => (
          <span key={h}>{h > 12 ? `${h - 12}p` : `${h}a`}</span>
        ))}
      </div>

      <div className="legend">
        <span className="legend-key">
          <span className="legend-swatch" style={{ background: 'var(--moss)' }} />
          focused
        </span>
        <span className="legend-key">
          <span className="legend-swatch" style={{ background: 'var(--cream-deep)' }} />
          distracted
        </span>
        <span className="legend-key">
          <span
            className="legend-swatch"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--cream-deep) 0 2px, transparent 2px 5px)'
            }}
          />
          away
        </span>
      </div>
    </div>
  )
}
