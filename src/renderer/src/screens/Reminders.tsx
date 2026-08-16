import { useState } from 'react'
import type { ClientState, Reminder, ReminderKind } from '@shared/types'
import type { Send } from '../App'
import { ReminderEditor } from './ReminderEditor'

const ICONS: Record<ReminderKind, string> = {
  water: '💧',
  stretch: '🤸',
  eyes: '👁',
  stand: '🚶',
  winddown: '🌙',
  medication: '💊',
  custom: '✳️'
}

export function Reminders({ state, send }: { state: ClientState; send: Send }): React.JSX.Element {
  const general = state.reminders.filter((r) => r.kind !== 'medication')
  const medication = state.reminders.filter((r) => r.kind === 'medication')
  // `null` means the editor is closed; `undefined` inside it means "new".
  const [editing, setEditing] = useState<Reminder | undefined | null>(null)

  return (
    <>
      <header className="page-head">
        <h1>Reminders</h1>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setEditing(undefined)}>
          + Add
        </button>
      </header>

      <section className="reminder-group">
        {general.map((r) => (
          <ReminderRow key={r.id} reminder={r} send={send} onEdit={() => setEditing(r)} />
        ))}
      </section>

      {medication.length > 0 && (
        <section className="reminder-group is-medication">
          <p className="group-title">Medication</p>
          {medication.map((r) => (
            <div key={r.id}>
              <ReminderRow reminder={r} send={send} onEdit={() => setEditing(r)} />
              {/*
                This wording is deliberate and load-bearing. Pawse records what
                you tell it and nothing more — it must never imply it knows
                whether a dose was actually taken.
              */}
              <p className="medication-note">
                Pawse reminds you and records what you tell it. It never marks a dose taken on its
                own, and it can't remind you while your computer is off.
              </p>
              <p className="medication-today">
                Today: {r.lastFiredAt ? `reminded ${time(r.lastFiredAt)}` : 'not reminded yet'}
                {r.lastConfirmedAt && isToday(r.lastConfirmedAt)
                  ? ` · you confirmed ${time(r.lastConfirmedAt)}`
                  : ''}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <p className="section-label">Delivery</p>
        <div className="panel">
          <div className="setting-row">
            <span className="setting-label">Style</span>
            <div className="seg">
              {(['gentle', 'normal', 'persistent'] as const).map((s) => (
                <button
                  key={s}
                  aria-pressed={state.settings.reminderStyle === s}
                  onClick={() => void send({ type: 'settings:patch', patch: { reminderStyle: s } })}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <CheckRow
            label="Hold non-urgent reminders until a session ends"
            checked={state.settings.holdNonUrgent}
            onChange={(v) => void send({ type: 'settings:patch', patch: { holdNonUrgent: v } })}
          />
          <CheckRow
            label="Stay quiet during full-screen apps and calls"
            checked={state.settings.quietDuringFullscreen}
            onChange={(v) =>
              void send({ type: 'settings:patch', patch: { quietDuringFullscreen: v } })
            }
          />
          <CheckRow
            label="Hold medication reminders"
            hint="off by default — medication reminders are never delayed unless you ask"
            checked={state.settings.holdMedication}
            onChange={(v) => void send({ type: 'settings:patch', patch: { holdMedication: v } })}
          />
        </div>
      </section>

      {editing !== null && (
        <ReminderEditor reminder={editing} send={send} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function ReminderRow({
  reminder,
  send,
  onEdit
}: {
  reminder: Reminder
  send: Send
  onEdit: () => void
}): React.JSX.Element {
  return (
    <div className="reminder-row">
      <span className="reminder-icon" aria-hidden="true">
        {ICONS[reminder.kind]}
      </span>
      <div>
        <p className="reminder-name">{reminder.label}</p>
        <p className="reminder-schedule">{schedule(reminder)}</p>
      </div>
      <div className="spacer" />
      <button className="btn btn-ghost btn-sm" onClick={onEdit}>
        edit
      </button>
      <button
        className="toggle"
        role="switch"
        aria-checked={reminder.enabled}
        aria-pressed={reminder.enabled}
        aria-label={`${reminder.label} reminders`}
        onClick={() =>
          void send({
            type: 'reminder:toggle',
            reminderId: reminder.id,
            enabled: !reminder.enabled
          })
        }
      >
        <span />
      </button>
    </div>
  )
}

function CheckRow({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <button
        className="check"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
      <div className="setting-label">
        <span>{label}</span>
        {hint && <p className="setting-hint">{hint}</p>}
      </div>
    </div>
  )
}

function schedule(r: Reminder): string {
  const parts: string[] = []
  if (r.everyMinutes) {
    parts.push(
      r.everyMinutes % 60 === 0 && r.everyMinutes >= 120
        ? `every ${r.everyMinutes / 60} hrs`
        : `every ${r.everyMinutes} min`
    )
  }
  if (r.atTime) parts.push(`${r.atTime} daily`)
  if (r.onlyDuringFocus) parts.push('during focus')
  else if (r.windowStart && r.windowEnd) parts.push(`${short(r.windowStart)}–${short(r.windowEnd)}`)
  return parts.join(' · ')
}

function short(hhmm: string): string {
  const [h] = hhmm.split(':').map(Number)
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function isToday(at: number): boolean {
  const d = new Date(at)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}
