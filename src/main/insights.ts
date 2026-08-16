import type { AppState, DaySlotState, Insights, LogEntry, ReminderKind } from '@shared/types'
import { startOfLocalDay } from './log'

/**
 * Everything here is computed locally from the activity log and phrased as an
 * observation, never a verdict. Pawse reports patterns; it does not diagnose,
 * score, or grade the person using it.
 */

const DAY_MS = 86_400_000
const STRIP_START_HOUR = 9
const STRIP_END_HOUR = 21
const SLOT_MINUTES = 30

interface Span {
  from: number
  to: number
}

/** Reconstruct session spans from completion entries (`at` is the end time). */
function focusSpans(log: LogEntry[]): Span[] {
  return log
    .filter((e) => e.type === 'focus_completed' || e.type === 'focus_abandoned')
    .map((e) => ({ from: e.at - (e.minutes ?? 0) * 60_000, to: e.at }))
    .filter((s) => s.to > s.from)
}

function overlaps(span: Span, from: number, to: number): boolean {
  return span.from < to && span.to > from
}

export function computeInsights(state: AppState, now: number): Insights {
  const log = state.log
  const dayStart = startOfLocalDay(now)
  const today = log.filter((e) => e.at >= dayStart)
  const spans = focusSpans(log)

  const todayFocusMinutes = today
    .filter((e) => e.type === 'focus_completed' || e.type === 'focus_abandoned')
    .reduce((sum, e) => sum + (e.minutes ?? 0), 0)

  // A live session counts toward today as it happens, so the number moves.
  const liveMinutes = state.session ? Math.round(state.session.activeMs / 60_000) : 0

  const dayStrip: Array<{ at: number; state: DaySlotState }> = []
  for (let h = STRIP_START_HOUR; h < STRIP_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      const from = dayStart + h * 3_600_000 + m * 60_000
      const to = from + SLOT_MINUTES * 60_000
      let slot: DaySlotState = 'away'
      if (from <= now) {
        if (spans.some((s) => overlaps(s, from, to))) slot = 'focused'
        else if (today.some((e) => e.type === 'doomscroll_prompted' && e.at >= from && e.at < to))
          slot = 'distracted'
      }
      dayStrip.push({ at: from, state: slot })
    }
  }

  const hourHistogram = new Array(24).fill(0)
  const weekAgo = now - 7 * DAY_MS
  for (const span of spans) {
    if (span.to < weekAgo) continue
    // Attribute each span to the hours it actually covered.
    let cursor = Math.max(span.from, weekAgo)
    while (cursor < span.to) {
      const hour = new Date(cursor).getHours()
      const hourEnd = new Date(cursor).setMinutes(60, 0, 0)
      const chunkEnd = Math.min(hourEnd, span.to)
      hourHistogram[hour] += (chunkEnd - cursor) / 60_000
      cursor = chunkEnd
    }
  }

  const care = state.reminders
    .filter((r) => r.enabled)
    .map((r) => ({
      kind: r.kind as ReminderKind,
      label: r.label,
      done: countConfirmDays(log, r.kind, now),
      of: 7
    }))

  const returns = today.filter((e) => e.type === 'returned_from_distraction').length

  return {
    todayFocusMinutes: todayFocusMinutes + liveMinutes,
    todayDistractedMinutes: 0,
    sessionsToday: today.filter((e) => e.type === 'focus_completed').length,
    chaptersToday: today.filter((e) => e.type === 'chapter_done').length,
    returns,
    dayStrip,
    hourHistogram: hourHistogram.map((v) => Math.round(v)),
    care,
    topDomains: [],
    observations: observationsFrom(hourHistogram, todayFocusMinutes + liveMinutes, returns),
    suggestion: suggestDuration(log, now)
  }
}

/**
 * Compare how much focus actually landed at each planned session length.
 * Deliberately conservative: it stays quiet until there are at least three
 * sessions at each length and a margin big enough to be worth mentioning.
 * A suggestion built on two data points is just noise with a button on it.
 */
function suggestDuration(
  log: LogEntry[],
  now: number
): { text: string; defaultMinutes: number } | undefined {
  const recent = log.filter((e) => e.type === 'focus_completed' && e.at >= now - 14 * DAY_MS)
  const byPlanned = new Map<number, number[]>()

  for (const e of recent) {
    const planned = Number(e.meta?.planned)
    if (!Number.isFinite(planned) || planned <= 0) continue
    const bucket = byPlanned.get(planned) ?? []
    bucket.push(e.minutes ?? 0)
    byPlanned.set(planned, bucket)
  }

  const scored = [...byPlanned.entries()]
    .filter(([, runs]) => runs.length >= 3)
    .map(([planned, runs]) => ({
      planned,
      mean: runs.reduce((a, b) => a + b, 0) / runs.length
    }))
    .sort((a, b) => b.mean - a.mean)

  if (scored.length < 2) return undefined
  const [best, next] = scored
  if (best.mean < next.mean * 1.2) return undefined

  return {
    text: `${best.planned}-minute sessions worked better than ${next.planned} for you.`,
    defaultMinutes: best.planned
  }
}

function countConfirmDays(log: LogEntry[], kind: string, now: number): number {
  const days = new Set<number>()
  const weekAgo = now - 7 * DAY_MS
  for (const e of log) {
    if (e.type !== 'reminder_confirmed' || e.at < weekAgo) continue
    if (e.meta?.kind !== kind) continue
    days.add(startOfLocalDay(e.at))
  }
  return days.size
}

function observationsFrom(hist: number[], todayMinutes: number, returns: number): string[] {
  const out: string[] = []

  const best = hist.reduce((acc, v, i) => (v > hist[acc] ? i : acc), 0)
  if (hist[best] > 0) {
    const from = fmtHour(best)
    const to = fmtHour((best + 2) % 24)
    out.push(`your longest focused stretches were between ${from} and ${to} this week.`)
  }

  if (todayMinutes > 0) {
    out.push(`${todayMinutes} focused minutes today.`)
  }

  if (returns > 0) {
    out.push(`you came back ${returns} time${returns === 1 ? '' : 's'} after getting pulled away.`)
  }

  if (out.length === 0) {
    out.push('not much to go on yet — finish a session and this fills in.')
  }
  return out
}

function fmtHour(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${suffix}`
}
