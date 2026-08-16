import { useState } from 'react'
import type { Reminder } from '@shared/types'
import type { Send } from '../App'

/**
 * Create or edit a reminder.
 *
 * Two schedule shapes cover everything people actually ask for: "every N
 * minutes" and "at this time each day". Anything more expressive (cron-ish
 * rules, weekday sets) would be a lot of interface for a case nobody has
 * raised yet.
 */

function blank(): Reminder {
  return {
    id: `custom-${Date.now().toString(36)}`,
    kind: 'custom',
    label: '',
    message: '',
    everyMinutes: 60,
    enabled: true,
    urgent: false,
    todayCount: 0
  }
}

export function ReminderEditor({
  reminder,
  send,
  onClose
}: {
  /** Omitted when creating a new one. */
  reminder?: Reminder
  send: Send
  onClose: () => void
}): React.JSX.Element {
  const isNew = !reminder
  const [draft, setDraft] = useState<Reminder>(reminder ? { ...reminder } : blank())
  const [mode, setMode] = useState<'interval' | 'time'>(draft.atTime ? 'time' : 'interval')
  const [useWindow, setUseWindow] = useState(Boolean(draft.windowStart && draft.windowEnd))

  const patch = (p: Partial<Reminder>): void => setDraft({ ...draft, ...p })

  const save = (): void => {
    const next: Reminder = { ...draft, label: draft.label.trim() || 'Reminder' }

    // Keep exactly one schedule on the object, or `isDue` sees both.
    if (mode === 'interval') {
      next.atTime = undefined
      next.everyMinutes = Math.max(1, Number(next.everyMinutes) || 60)
    } else {
      next.everyMinutes = undefined
      next.atTime = next.atTime || '21:00'
    }

    if (!useWindow || mode === 'time') {
      next.windowStart = undefined
      next.windowEnd = undefined
    }

    void send(isNew ? { type: 'reminder:add', reminder: next } : { type: 'reminder:update', reminder: next })
    onClose()
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>{isNew ? 'New reminder' : draft.label || 'Reminder'}</h2>

        <label className="stack">
          <span className="label">name</span>
          <input
            className="field"
            autoFocus
            maxLength={40}
            placeholder="Posture check"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>

        <label className="stack">
          <span className="label">what the cat says</span>
          <input
            className="field"
            maxLength={120}
            placeholder="sitting up straight?"
            value={draft.message ?? ''}
            onChange={(e) => patch({ message: e.target.value })}
          />
          <span className="setting-hint">optional — falls back to the name</span>
        </label>

        <div className="stack">
          <span className="label">when</span>
          <div className="seg">
            <button aria-pressed={mode === 'interval'} onClick={() => setMode('interval')}>
              Every so often
            </button>
            <button aria-pressed={mode === 'time'} onClick={() => setMode('time')}>
              At a time
            </button>
          </div>
        </div>

        {mode === 'interval' ? (
          <>
            <div className="row">
              <span className="label" style={{ minWidth: 60 }}>
                every
              </span>
              <input
                className="field"
                style={{ width: 90 }}
                inputMode="numeric"
                value={draft.everyMinutes ?? 60}
                onChange={(e) =>
                  patch({ everyMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })
                }
              />
              <span className="muted">minutes</span>
            </div>

            <div className="row">
              <button
                className="check"
                role="checkbox"
                aria-checked={draft.onlyDuringFocus ?? false}
                aria-label="only during focus sessions"
                onClick={() => patch({ onlyDuringFocus: !draft.onlyDuringFocus })}
              />
              <span>only during focus sessions</span>
            </div>

            {!draft.onlyDuringFocus && (
              <>
                <div className="row">
                  <button
                    className="check"
                    role="checkbox"
                    aria-checked={useWindow}
                    aria-label="only between certain hours"
                    onClick={() => setUseWindow(!useWindow)}
                  />
                  <span>only between certain hours</span>
                </div>

                {useWindow && (
                  <div className="row">
                    <input
                      className="field"
                      style={{ width: 130 }}
                      type="time"
                      value={draft.windowStart ?? '09:00'}
                      onChange={(e) => patch({ windowStart: e.target.value })}
                    />
                    <span className="muted">to</span>
                    <input
                      className="field"
                      style={{ width: 130 }}
                      type="time"
                      value={draft.windowEnd ?? '18:00'}
                      onChange={(e) => patch({ windowEnd: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="row">
            <span className="label" style={{ minWidth: 60 }}>
              at
            </span>
            <input
              className="field"
              style={{ width: 130 }}
              type="time"
              value={draft.atTime ?? '21:00'}
              onChange={(e) => patch({ atTime: e.target.value })}
            />
            <span className="muted">every day</span>
          </div>
        )}

        <div className="row">
          <button
            className="check"
            role="checkbox"
            aria-checked={draft.urgent}
            aria-label="never hold this one back"
            onClick={() => patch({ urgent: !draft.urgent })}
          />
          <div>
            <span>never hold this one back</span>
            <p className="setting-hint">
              it will interrupt a focus session instead of waiting for a gap
            </p>
          </div>
        </div>

        <div className="row">
          {!isNew && !draft.builtIn && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                void send({ type: 'reminder:remove', reminderId: draft.id })
                onClose()
              }}
            >
              Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!draft.label.trim()}>
            {isNew ? 'Add reminder' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
