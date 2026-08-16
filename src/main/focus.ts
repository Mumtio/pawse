import { randomUUID } from 'node:crypto'
import type { AppState, FocusMode, FocusSession, RewardGrant, SessionSummary } from '@shared/types'
import { grantRewards, rollFood, setTransientMood } from './pet'
import { pushLog } from './log'

/**
 * The focus session state machine. It lives in the main process on purpose:
 * the dashboard window is hidden the moment a session starts, and a hidden
 * renderer gets throttled, so a timer running there would drift or stall.
 *
 * Every duration is derived from wall-clock timestamps rather than counted
 * ticks, so sleeping the laptop mid-session doesn't desync the clock.
 */

export interface StartParams {
  taskTitle: string
  minutes: number
  breakMinutes: number
  mode: FocusMode
  questId?: string
  chapterId?: string
  checklist: string[]
}

export function startSession(state: AppState, p: StartParams): void {
  const now = Date.now()
  state.session = {
    id: randomUUID(),
    taskTitle: p.taskTitle.trim() || 'Focus',
    questId: p.questId,
    chapterId: p.chapterId,
    plannedMinutes: p.minutes,
    breakMinutes: p.breakMinutes,
    mode: p.mode,
    phase: 'focus',
    phaseStartedAt: now,
    phaseAccumulatedMs: 0,
    paused: false,
    startedAt: now,
    activeMs: 0,
    idleMs: 0,
    distractedMs: 0,
    interruptions: 0,
    returns: 0,
    checklist: p.checklist
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: randomUUID(), text, done: false }))
  }
  state.lastSummary = null
  setTransientMood(state, 'studying', 4000)
  pushLog(state, { at: now, type: 'focus_started', meta: { task: state.session.taskTitle } })
}

export function phaseTotalMs(session: FocusSession): number {
  const minutes = session.phase === 'break' ? session.breakMinutes : session.plannedMinutes
  return Math.max(0, minutes) * 60_000
}

export function phaseElapsedMs(session: FocusSession, now: number): number {
  const running = session.paused ? 0 : Math.max(0, now - session.phaseStartedAt)
  return session.phaseAccumulatedMs + running
}

export function phaseRemainingMs(session: FocusSession, now: number): number {
  if (session.phase === 'done') return 0
  return Math.max(0, phaseTotalMs(session) - phaseElapsedMs(session, now))
}

/** A stopwatch session (0 minutes planned) counts up and never self-ends. */
export function isOpenEnded(session: FocusSession): boolean {
  return session.phase === 'focus' && session.plannedMinutes <= 0
}

export function pauseSession(state: AppState, now = Date.now(), countInterruption = true): void {
  const s = state.session
  if (!s || s.paused || s.phase === 'done') return
  s.phaseAccumulatedMs = phaseElapsedMs(s, now)
  s.phaseStartedAt = now
  s.paused = true
  if (countInterruption) s.interruptions += 1
}

export function resumeSession(state: AppState, now = Date.now()): void {
  const s = state.session
  if (!s || !s.paused || s.phase === 'done') return
  s.phaseStartedAt = now
  s.paused = false
}

/** Advance the running tallies. `deltaMs` is the time since the previous tick. */
export function tickSession(state: AppState, now: number, deltaMs: number, isIdle: boolean): void {
  const s = state.session
  if (!s || s.phase === 'done') return

  if (isIdle) {
    s.idleMs += deltaMs
  } else if (!s.paused && s.phase === 'focus') {
    s.activeMs += deltaMs
  }

  // Stopwatch sessions run until the person says otherwise.
  if (isOpenEnded(s)) return
  if (phaseRemainingMs(s, now) > 0) return

  if (s.phase === 'focus') {
    if (s.breakMinutes > 0) {
      s.phase = 'break'
      s.phaseStartedAt = now
      s.phaseAccumulatedMs = 0
      s.paused = !state.settings.autoStartBreaks
      setTransientMood(state, 'break', 6000)
    } else {
      finishSession(state, now)
    }
  } else if (s.phase === 'break') {
    finishSession(state, now)
  }
}

/** Jump straight to the end of the current phase. */
export function skipPhase(state: AppState, now = Date.now()): void {
  const s = state.session
  if (!s || s.phase === 'done') return
  s.phaseAccumulatedMs = phaseTotalMs(s)
  s.phaseStartedAt = now
  tickSession(state, now, 0, false)
}

export function finishSession(state: AppState, now = Date.now(), abandoned = false): void {
  const s = state.session
  if (!s) return

  const activeMinutes = Math.round(s.activeMs / 60_000)
  const rewards: RewardGrant[] = []

  // A session only pays out if it was actually worked. Abandoning early costs
  // nothing — it just doesn't earn.
  if (!abandoned && activeMinutes >= 5) {
    const treats = Math.max(1, Math.round(activeMinutes / 15))
    rewards.push({ label: `${activeMinutes} focused minutes`, treats })
    const food = rollFood(0.8)
    if (food) rewards.push({ label: `${food.name} appeared`, item: food })
  }
  rewards.forEach((r) => grantRewards(state, r))

  const summary: SessionSummary = {
    taskTitle: s.taskTitle,
    activeMinutes,
    idleMinutes: Math.round(s.idleMs / 60_000),
    distractedMinutes: Math.round(s.distractedMs / 60_000),
    checklistDone: s.checklist.filter((c) => c.done).length,
    checklistTotal: s.checklist.length,
    returns: s.returns,
    rewards
  }

  s.phase = 'done'
  s.endedAt = now
  state.lastSummary = summary
  state.session = null

  if (!abandoned) setTransientMood(state, 'celebrating', 8000)
  pushLog(state, {
    at: now,
    type: abandoned ? 'focus_abandoned' : 'focus_completed',
    minutes: activeMinutes,
    meta: { task: s.taskTitle, planned: s.plannedMinutes }
  })
}

export function toggleChecklistItem(state: AppState, itemId: string): void {
  const item = state.session?.checklist.find((c) => c.id === itemId)
  if (item) item.done = !item.done
}
