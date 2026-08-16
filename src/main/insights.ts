import type { AppState, DaySlotState, Insights, LogEntry } from '@shared/types'
import { isBlockedDomain } from '@shared/defaults'
import { startOfLocalDay } from './log'

/**
 * Everything here is computed locally from the activity log and phrased as an
 * observation, never a verdict. Pawse reports patterns; it does not diagnose,
 * score, or grade the person using it.
 */

const DAY_MS = 86_400_000
const SLOT_MINUTES = 30

/**
 * The strip's default window. It widens to cover anything that actually
 * happened outside it — assuming office hours is exactly how this ends up
 * blank for someone who works at midnight, which reads as the feature being
 * broken rather than as the day being unusual.
 */
const STRIP_DEFAULT_START_HOUR = 9
const STRIP_DEFAULT_END_HOUR = 21

/** Older than this and it's no longer answering "where did this week go". */
const SITE_TIME_KEEP_DAYS = 14

/**
 * Add to the running total for a site, bucketed by local day.
 *
 * Lives here rather than in the bridge so it can be tested without an Electron
 * import — the bridge is the only caller, but this is the write half of the
 * pair that "where the time went" reads, and an untested write path is exactly
 * how that panel shipped permanently empty the first time.
 *
 * Pruned on write rather than on read: this is the only place the map grows,
 * and a stale bucket nothing reads is still a stale bucket in an exported file.
 */
export function recordSiteTime(
  state: AppState,
  domain: string,
  ms: number,
  now: number
): void {
  if (!domain || ms <= 0) return
  const day = String(startOfLocalDay(now))
  const bucket = (state.siteTime[day] ??= {})
  bucket[domain] = (bucket[domain] ?? 0) + ms

  const cutoff = startOfLocalDay(now - SITE_TIME_KEEP_DAYS * 86_400_000)
  for (const key of Object.keys(state.siteTime)) {
    if (Number(key) < cutoff) delete state.siteTime[key]
  }
}

interface Span {
  from: number
  to: number
}

/**
 * Reconstruct session spans from completion entries (`at` is the end time),
 * plus the session running right now.
 *
 * Without that live span the strip stays empty for the whole of your first
 * session and only fills in once you stop — which is precisely when you are
 * least likely to be looking at it.
 */
function focusSpans(log: LogEntry[], state: AppState, now: number): Span[] {
  const done = log
    .filter((e) => e.type === 'focus_completed' || e.type === 'focus_abandoned')
    .map((e) => ({ from: e.at - (e.minutes ?? 0) * 60_000, to: e.at }))
    .filter((s) => s.to > s.from)

  const live = state.session
  if (live && live.phase !== 'done') done.push({ from: live.startedAt, to: now })
  return done
}

function overlaps(span: Span, from: number, to: number): boolean {
  return span.from < to && span.to > from
}

/**
 * The hour range the strip should cover: the default working window, stretched
 * to include anything that happened outside it and always far enough to reach
 * the current time.
 */
function stripWindow(
  spans: Span[],
  today: LogEntry[],
  dayStart: number,
  now: number
): [number, number] {
  const hourOf = (at: number): number => Math.floor((at - dayStart) / 3_600_000)
  const marks: number[] = [hourOf(now)]

  for (const span of spans) {
    if (span.to < dayStart) continue
    marks.push(hourOf(Math.max(span.from, dayStart)), hourOf(Math.min(span.to, now)))
  }
  for (const e of today) {
    if (e.type === 'doomscroll_prompted') marks.push(hourOf(e.at))
  }

  const inRange = marks.filter((h) => h >= 0 && h <= 23)
  const start = Math.max(0, Math.min(STRIP_DEFAULT_START_HOUR, ...inRange))
  // +1 so the hour something happened in is itself included, not just its edge.
  const end = Math.min(24, Math.max(STRIP_DEFAULT_END_HOUR, ...inRange.map((h) => h + 1)))
  return [start, end]
}

export function computeInsights(state: AppState, now: number): Insights {
  const log = state.log
  const dayStart = startOfLocalDay(now)
  const today = log.filter((e) => e.at >= dayStart)
  const spans = focusSpans(log, state, now)

  const todayFocusMinutes = today
    .filter((e) => e.type === 'focus_completed' || e.type === 'focus_abandoned')
    .reduce((sum, e) => sum + (e.minutes ?? 0), 0)

  // A live session counts toward today as it happens, so the number moves.
  const liveMinutes = state.session ? Math.round(state.session.activeMs / 60_000) : 0

  const [stripStart, stripEnd] = stripWindow(spans, today, dayStart, now)
  const dayStrip: Array<{ at: number; state: DaySlotState }> = []
  for (let h = stripStart; h < stripEnd; h++) {
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

  const returns = today.filter((e) => e.type === 'returned_from_distraction').length

  const { blockedSites, studySites } = state.settings
  const topDomains = rankSites(state.siteTime, blockedSites, studySites, now, 7)
  const todayOnly = rankSites(state.siteTime, blockedSites, studySites, now, 1)

  const distractedMinutesWeek = topDomains
    .filter((d) => d.blocked)
    .reduce((sum, d) => sum + d.minutes, 0)
  const todayDistractedMinutes = todayOnly
    .filter((d) => d.blocked)
    .reduce((sum, d) => sum + d.minutes, 0)

  return {
    todayFocusMinutes: todayFocusMinutes + liveMinutes,
    todayDistractedMinutes,
    sessionsToday: today.filter((e) => e.type === 'focus_completed').length,
    chaptersToday: today.filter((e) => e.type === 'chapter_done').length,
    returns,
    dayStrip,
    hourHistogram: hourHistogram.map((v) => Math.round(v)),
    topDomains,
    distractedMinutesWeek,
    observations: observationsFrom({
      hist: hourHistogram,
      todayMinutes: todayFocusMinutes + liveMinutes,
      returns,
      topDomains,
      distractedMinutesWeek
    }),
    suggestion: suggestDuration(log, now)
  }
}

/**
 * Sites by time spent over the last `days`, biggest first.
 *
 * `blocked` is recomputed from the current lists rather than stored, so moving
 * a site between your two lists reclassifies its whole history at once. That's
 * the behaviour people expect: the question is "is this a distraction for me",
 * and the answer they just gave should apply to what they're looking at.
 */
function rankSites(
  siteTime: Record<string, Record<string, number>>,
  blockedSites: string[],
  studySites: string[],
  now: number,
  days: number
): Array<{ domain: string; minutes: number; blocked: boolean }> {
  const cutoff = startOfLocalDay(now - (days - 1) * DAY_MS)
  const totals = new Map<string, number>()

  for (const [day, bucket] of Object.entries(siteTime)) {
    if (Number(day) < cutoff) continue
    for (const [domain, ms] of Object.entries(bucket)) {
      totals.set(domain, (totals.get(domain) ?? 0) + ms)
    }
  }

  return [...totals.entries()]
    .map(([domain, ms]) => ({
      domain,
      minutes: Math.round(ms / 60_000),
      blocked: isBlockedDomain(domain, blockedSites, studySites)
    }))
    // A site you glanced at for under a minute is noise in a list of totals.
    .filter((d) => d.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8)
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

function observationsFrom({
  hist,
  todayMinutes,
  returns,
  topDomains,
  distractedMinutesWeek
}: {
  hist: number[]
  todayMinutes: number
  returns: number
  topDomains: Array<{ domain: string; minutes: number; blocked: boolean }>
  distractedMinutesWeek: number
}): string[] {
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

  /**
   * The distraction lines are the one place this screen could easily start
   * grading people, so they stay strictly factual: a number and a name, no
   * adjective attached to either. "you wasted 3 hours" is a verdict; "3h 12m
   * on blocked sites" is the same fact with the judgement left to the reader.
   */
  const worst = topDomains.find((d) => d.blocked)
  if (worst) {
    out.push(`${worst.domain} took the most of your blocked-site time — ${fmtDuration(worst.minutes)}.`)
  }
  if (distractedMinutesWeek > 0) {
    out.push(`${fmtDuration(distractedMinutesWeek)} on blocked sites this week.`)
  }

  if (returns > 0) {
    out.push(`you came back ${returns} time${returns === 1 ? '' : 's'} after getting pulled away.`)
  }

  if (out.length === 0) {
    out.push('not much to go on yet — finish a session and this fills in.')
  }
  return out
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtHour(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${suffix}`
}
