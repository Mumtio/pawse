import { randomUUID } from 'node:crypto'
import type { AppState, Bubble, BubbleAction, Reminder, ReminderKind } from '@shared/types'
import { pushLog, startOfLocalDay } from './log'
import { rewardCare } from './pet'

/**
 * Context-aware reminder scheduling.
 *
 * The rules that matter:
 *  - Urgent reminders (medication) are never held, batched, or auto-confirmed.
 *  - Reminders meant *for* a focus session (eye rest) still fire during one.
 *  - Everything else waits for a natural gap, and several that came due while
 *    you were working arrive together instead of as a queue of interruptions.
 */

const SNOOZE_MINUTES = 10

function minutesOfDay(at: number): number {
  const d = new Date(at)
  return d.getHours() * 60 + d.getMinutes()
}

function parseHHMM(value?: string): number | null {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

/**
 * Is `now` inside the reminder's active window?
 *
 * Windows are allowed to wrap past midnight, and they must be: "09:00 to
 * 08:00" is how you say "all day except the small hours", and a plain
 * start<=mins<=end test makes that window match nothing at all — the reminder
 * goes permanently silent with no indication why.
 */
function withinWindow(r: Reminder, now: number): boolean {
  const start = parseHHMM(r.windowStart)
  const end = parseHHMM(r.windowEnd)
  if (start === null || end === null) return true
  const mins = minutesOfDay(now)
  if (start === end) return true
  return start < end ? mins >= start && mins <= end : mins >= start || mins <= end
}

function isDue(r: Reminder, state: AppState, now: number): boolean {
  if (!r.enabled) return false
  if (r.snoozedUntil && now < r.snoozedUntil) return false
  if (r.onlyDuringFocus && !state.session) return false
  if (!withinWindow(r, now)) return false

  if (r.atTime) {
    const target = parseHHMM(r.atTime)
    if (target === null) return false
    const dayStart = startOfLocalDay(now)
    const fireAt = dayStart + target * 60_000
    if (now < fireAt) return false
    // Once per day.
    return !r.lastFiredAt || r.lastFiredAt < fireAt
  }

  if (r.everyMinutes) {
    /**
     * The baseline for a reminder that has never fired used to be
     * `pet.lastDecayAt` — which the pet tick rewrites to `now` every second.
     * The elapsed time was therefore always about zero, and no interval
     * reminder could ever come due on a fresh install. `baselineAt` is set
     * once, by tickReminders, and then stays put.
     */
    const since = r.lastFiredAt ?? r.lastConfirmedAt ?? r.baselineAt
    if (since === undefined) return false
    return now - since >= r.everyMinutes * 60_000
  }

  return false
}

/** Held reminders wait for a gap; the ones aimed at focus sessions don't. */
function mustWaitForGap(r: Reminder, state: AppState): boolean {
  if (r.urgent && !state.settings.holdMedication) return false
  if (r.onlyDuringFocus) return false
  return Boolean(state.session) && state.settings.holdNonUrgent
}

const COPY: Record<ReminderKind, { text: string; confirm: string; defer: string }> = {
  water: { text: 'water break?', confirm: 'drank it', defer: 'later' },
  stretch: { text: 'shall we stretch?', confirm: 'stretched', defer: 'later' },
  eyes: { text: 'look out the window for twenty seconds?', confirm: 'done', defer: 'later' },
  stand: { text: 'stand up for a minute?', confirm: 'stood up', defer: 'later' },
  winddown: { text: 'winding down soon?', confirm: 'ok', defer: 'not yet' },
  // Never phrased as an instruction, and never confirmed on the user's behalf.
  medication: { text: 'evening dose — did you take it?', confirm: 'i took it', defer: 'not yet' },
  custom: { text: 'a reminder for you', confirm: 'done', defer: 'later' }
}

function bubbleFor(r: Reminder): Bubble {
  const copy = COPY[r.kind] ?? COPY.custom
  // A custom message wins; otherwise fall back to the wording for the kind,
  // and for custom reminders with no message, the name itself.
  const text = r.message?.trim() || (r.kind === 'custom' ? r.label.toLowerCase() : copy.text)
  const actions: BubbleAction[] = [
    { id: 'confirm', label: copy.confirm, intent: { type: 'reminder:confirm', reminderId: r.id } },
    {
      id: 'snooze',
      label: copy.defer,
      intent: { type: 'reminder:snooze', reminderId: r.id, minutes: SNOOZE_MINUTES }
    }
  ]
  return {
    id: randomUUID(),
    kind: 'reminder',
    text,
    actions,
    createdAt: Date.now(),
    reminderId: r.id
  }
}

function combinedBubble(reminders: Reminder[]): Bubble {
  const names = reminders.map((r) => r.label.toLowerCase()).join(', ')
  return {
    id: randomUUID(),
    kind: 'reminder',
    text: `while you were working: ${names}`,
    actions: reminders.map((r) => ({
      id: r.id,
      label: (COPY[r.kind] ?? COPY.custom).confirm,
      intent: { type: 'reminder:confirm', reminderId: r.id } as const
    })),
    createdAt: Date.now()
  }
}

export function tickReminders(state: AppState, now: number): void {
  if (state.settings.trackingPaused) return

  // Anchor any interval reminder that has never fired, so "every 45 minutes"
  // is measured from a fixed point rather than from a moving one. First run
  // after setup therefore arrives one full interval later, which is what
  // someone setting a 45-minute reminder expects.
  for (const r of state.reminders) {
    if (
      r.everyMinutes &&
      r.lastFiredAt === undefined &&
      r.lastConfirmedAt === undefined &&
      r.baselineAt === undefined
    ) {
      r.baselineAt = now
    }
  }

  const alreadyShowing = new Set(
    state.bubbles.filter((b) => b.reminderId).map((b) => b.reminderId as string)
  )

  const due = state.reminders.filter(
    (r) => isDue(r, state, now) && !alreadyShowing.has(r.id) && !mustWaitForGap(r, state)
  )
  if (due.length === 0) return

  // Several came due while a session ran — deliver them as one interruption.
  const batched = !state.session && due.length > 1 && due.every((r) => !r.urgent)
  if (batched) {
    state.bubbles.push(combinedBubble(due))
  } else {
    due.forEach((r) => state.bubbles.push(bubbleFor(r)))
  }

  due.forEach((r) => {
    r.lastFiredAt = now
    pushLog(state, { at: now, type: 'reminder_fired', meta: { kind: r.kind } })
  })
}

const CARE_MOOD: Partial<Record<ReminderKind, 'drinking' | 'stretching' | 'curious'>> = {
  water: 'drinking',
  stretch: 'stretching',
  stand: 'stretching',
  eyes: 'curious'
}

export function confirmReminder(state: AppState, reminderId: string, now = Date.now()): void {
  const r = state.reminders.find((x) => x.id === reminderId)
  if (!r) return
  r.lastConfirmedAt = now
  r.lastFiredAt = now
  r.snoozedUntil = undefined
  r.todayCount += 1

  rewardCare(state, CARE_MOOD[r.kind] ?? 'celebrating')
  pushLog(state, { at: now, type: 'reminder_confirmed', meta: { kind: r.kind } })
  dropBubblesFor(state, reminderId)
}

export function snoozeReminder(state: AppState, reminderId: string, minutes: number): void {
  const r = state.reminders.find((x) => x.id === reminderId)
  if (!r) return
  const now = Date.now()
  r.snoozedUntil = now + minutes * 60_000
  r.lastFiredAt = now
  pushLog(state, { at: now, type: 'reminder_snoozed', meta: { kind: r.kind, minutes } })
  dropBubblesFor(state, reminderId)
}

function dropBubblesFor(state: AppState, reminderId: string): void {
  state.bubbles = state.bubbles.filter((b) => {
    if (b.reminderId === reminderId) return false
    // A nudge that offered this as one of its answers has now been answered.
    if (
      b.kind === 'nudge' &&
      b.actions.some((a) => 'reminderId' in a.intent && a.intent.reminderId === reminderId)
    ) {
      return false
    }
    // A batched bubble loses just the one answered action.
    if (!b.reminderId && b.kind === 'reminder') {
      b.actions = b.actions.filter(
        (a) => !('reminderId' in a.intent && a.intent.reminderId === reminderId)
      )
      return b.actions.length > 0
    }
    return true
  })
}

/**
 * Nudges are ephemeral chatter. The moment the person does something
 * deliberate — starts a session, opens the app, stops working — whatever the
 * cat was musing about is stale and should get out of the way.
 */
export function clearNudges(state: AppState): void {
  state.bubbles = state.bubbles.filter((b) => b.kind !== 'nudge')
}

/** Reset the per-day confirmation counters at local midnight. */
export function rolloverDaily(state: AppState, now: number): void {
  const dayStart = startOfLocalDay(now)
  state.reminders.forEach((r) => {
    if (r.lastConfirmedAt && r.lastConfirmedAt < dayStart) r.todayCount = 0
  })
}
