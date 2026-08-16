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
  // The window follows the day's activity, so the axis is read off the slots
  // rather than assumed. A hardcoded 9-to-9 axis silently mislabels every
  // column on any day that started earlier or ran later.
  const labels = axisLabels(slots)

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
          <span key={h}>{fmtHour(h)}</span>
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

/** Roughly six evenly spaced hour marks across whatever window the strip covers. */
function axisLabels(slots: Array<{ at: number }>): number[] {
  if (slots.length === 0) return []
  const first = new Date(slots[0].at).getHours()
  const last = new Date(slots[slots.length - 1].at).getHours() + 1
  const span = Math.max(1, last - first)
  const step = Math.max(1, Math.round(span / 6))

  const out: number[] = []
  for (let h = first; h <= last; h += step) out.push(h)
  return out
}

function fmtHour(h: number): string {
  const hour = h % 24
  if (hour === 0) return '12a'
  if (hour === 12) return '12p'
  return hour > 12 ? `${hour - 12}p` : `${hour}a`
}
