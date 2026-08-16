import { useState } from 'react'
import type { Reminder, ReminderKind } from '@shared/types'
import type { Send } from '../App'

/**
 * Create or edit a reminder.
 *
 * Two schedule shapes cover everything people actually ask for: "every N
 * minutes" and "at this time each day". Anything more expressive (cron-ish
 * rules, weekday sets) would be a lot of interface for a case nobody has
 * raised yet.
 */

function blank(kind: ReminderKind = 'custom'): Reminder {
  const isMed = kind === 'medication'
  return {
    id: `${kind}-${Date.now().toString(36)}`,
    kind,
    label: '',
    message: '',
    // A dose is a time of day, not an interval — nobody takes one every 90
    // minutes, and defaulting to that makes the common case extra work.
    everyMinutes: isMed ? undefined : 60,
    atTime: isMed ? '21:00' : undefined,
    enabled: true,
    // Medication is never held back or batched unless you explicitly ask.
    urgent: isMed,
    todayCount: 0
  }
}

export function ReminderEditor({
  reminder,
  newKind,
  send,
  onClose
}: {
  /** Omitted when creating a new one. */
  reminder?: Reminder
  /** What kind to start a new reminder as. Ignored when editing. */
  newKind?: ReminderKind
  send: Send
  onClose: () => void
}): React.JSX.Element {
  const isNew = !reminder
  const [draft, setDraft] = useState<Reminder>(reminder ? { ...reminder } : blank(newKind))
  const [mode, setMode] = useState<'interval' | 'time'>(draft.atTime ? 'time' : 'interval')
  const [useWindow, setUseWindow] = useState(Boolean(draft.windowStart && draft.windowEnd))
  const isMedication = draft.kind === 'medication'

  const patch = (p: Partial<Reminder>): void => setDraft({ ...draft, ...p })

  /**
   * Switching to medication turns on the protections that make it medication:
   * urgent by default, and scheduled at a time rather than on a loop. Switching
   * away leaves them as they are — silently un-urgenting a dose reminder
   * because someone changed a dropdown is not a decision this should make.
   */
  const setKind = (kind: ReminderKind): void => {
    if (kind === draft.kind) return
    if (kind === 'medication') {
      setMode('time')
      setDraft({
        ...draft,
        kind,
        urgent: true,
        everyMinutes: undefined,
        atTime: draft.atTime || '21:00'
      })
      return
    }
    setDraft({ ...draft, kind })
  }

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
        <h2>
          {isNew ? (isMedication ? 'New medication reminder' : 'New reminder') : draft.label || 'Reminder'}
        </h2>

        {/* Built-in reminders are what they are; only custom ones can switch. */}
        {!draft.builtIn && (
          <div className="stack">
            <span className="label">kind</span>
            <div className="seg">
              <button aria-pressed={!isMedication} onClick={() => setKind('custom')}>
                General
              </button>
              <button aria-pressed={isMedication} onClick={() => setKind('medication')}>
                Medication
              </button>
            </div>
          </div>
        )}

        <label className="stack">
          <span className="label">name</span>
          <input
            className="field"
            autoFocus
            maxLength={40}
            placeholder={isMedication ? 'Morning dose' : 'Posture check'}
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
          {isMedication && (
            <span className="setting-hint">
              a name you'll recognise. Pawse never asks what the medication is.
            </span>
          )}
        </label>

        {isMedication && (
          /*
            The same load-bearing wording as the Reminders screen, repeated at
            the point of creation. Someone setting up a dose reminder is
            entitled to know exactly what this will and won't do before they
            start relying on it.
          */
          <p className="medication-note">
            Pawse reminds you and records what you tell it. It never marks a dose taken on its own,
            it can't remind you while your computer is off, and it does not track doses, amounts, or
            what you're taking. Don't rely on it as your only reminder for anything that matters.
          </p>
        )}

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
