import { powerMonitor } from 'electron'
import { getState, publish } from './appState'
import { advanceMoodQueue, deriveMood, tickPet } from './pet'
import {
  isOpenEnded,
  pauseSession,
  phaseElapsedMs,
  phaseRemainingMs,
  resumeSession,
  tickSession
} from './focus'
import { rolloverDaily, tickReminders } from './reminders'
import { isExtensionConnected } from './bridge'
import { tickNudges } from './nudges'
import { playSound } from './sound'

/**
 * One heartbeat for the whole app.
 *
 * Everything time-based hangs off this single interval in the main process.
 * The dashboard window is hidden during a focus session, and hidden renderers
 * get throttled — a timer living there would drift or stall outright. Elapsed
 * time is always derived from wall-clock timestamps rather than counted ticks,
 * so sleeping the laptop mid-session doesn't desync anything.
 */

const TICK_MS = 1000

/** No word from the extension for this long and the active domain is stale. */
const DOMAIN_STALE_MS = 20_000

let timer: NodeJS.Timeout | null = null
let lastTick = Date.now()
/** True while the session is paused because the user stepped away. */
let pausedByIdle = false

export function startClock(): void {
  if (timer) return
  lastTick = Date.now()
  timer = setInterval(tick, TICK_MS)
}

export function stopClock(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function tick(): void {
  const state = getState()
  const now = Date.now()
  // Clamp so a system suspend doesn't dump an hour into one tick.
  const delta = Math.min(Math.max(now - lastTick, 0), 60_000)
  lastTick = now

  const idleSeconds = powerMonitor.getSystemIdleTime()
  const isIdle = idleSeconds >= state.settings.idleThresholdMin * 60

  // The extension reports every few seconds. If those reports stop, the tab
  // was closed or you left the browser — either way the old domain is stale
  // and must not keep the cat glaring at you.
  if (state.runtime.domainSeenAt && now - state.runtime.domainSeenAt > DOMAIN_STALE_MS) {
    state.runtime.currentDomain = undefined
    state.runtime.distractedSince = undefined
  }
  const isDistracted = Boolean(state.runtime.distractedSince) && !isIdle

  tickPet(state, now, isIdle, isDistracted)

  if (state.session) {
    // Stepping away pauses the session rather than burning it. Coming back
    // resumes automatically — no interruption is counted against you for it.
    if (isIdle && !state.session.paused) {
      pauseSession(state, now, false)
      pausedByIdle = true
    } else if (!isIdle && pausedByIdle && state.session.paused) {
      resumeSession(state, now)
      pausedByIdle = false
    }
    tickSession(state, now, delta, isIdle)
  } else {
    pausedByIdle = false
  }

  const phaseBefore = state.session?.phase
  const bubblesBefore = state.bubbles.length
  const summaryBefore = state.lastSummary

  tickReminders(state, now)
  tickNudges(state, now, isIdle, isDistracted)
  rolloverDaily(state, now)

  state.bubbles = state.bubbles.filter((b) => !b.expiresAt || b.expiresAt > now)

  // Cues for the things that happen on their own rather than by a click.
  if (state.bubbles.length > bubblesBefore) playSound('bubble')
  if (phaseBefore === 'focus' && state.session?.phase === 'break') playSound('break')
  if (!summaryBefore && state.lastSummary) playSound('complete')

  // A finished mood either hands over to the next queued one (eat → pleased)
  // or lets the derived mood take back over.
  if (state.pet.moodUntil && state.pet.moodUntil <= now) {
    if (!advanceMoodQueue(state, now)) state.pet.moodUntil = undefined
  }
  state.pet.mood = deriveMood(state, isIdle, isDistracted)

  state.runtime.now = now
  state.runtime.idleSeconds = idleSeconds
  state.runtime.extensionConnected = isExtensionConnected()
  // For a stopwatch session this carries elapsed time instead of remaining —
  // the UI decides which way to read it from plannedMinutes.
  state.runtime.phaseRemainingSec = state.session
    ? Math.ceil(
        (isOpenEnded(state.session)
          ? phaseElapsedMs(state.session, now)
          : phaseRemainingMs(state.session, now)) / 1000
      )
    : 0

  publish()
}
