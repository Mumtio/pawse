/**
 * Behaviour checks for the parts that decide what the cat does.
 *
 * These are pure functions over AppState, so they can be exercised without
 * launching Electron — which matters because the alternative is starting a
 * focus session by hand and scrolling a feed for a few minutes every time one
 * of them changes.
 *
 *   npm run check
 */
import type { AppState } from '../src/shared/types'
import { createInitialState } from '../src/shared/defaults'
import { deriveMood, tickPet } from '../src/main/pet'
import { tickNudges } from '../src/main/nudges'

let failures = 0

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`)
}

function state(overrides: Partial<AppState> = {}): AppState {
  const now = Date.now()
  return {
    ...createInitialState(now),
    runtime: {
      now,
      idleSeconds: 0,
      catVisible: true,
      mainVisible: true,
      phaseRemainingSec: 0,
      extensionConnected: true,
      llmBusy: false
    },
    ...overrides
  } as AppState
}

function withSession(s: AppState): AppState {
  const now = Date.now()
  s.session = {
    id: 'test',
    taskTitle: 'Ch.4',
    plannedMinutes: 45,
    breakMinutes: 5,
    mode: 'deep',
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
    checklist: []
  }
  return s
}

// -- mood ------------------------------------------------------------------

const working = withSession(state())
check('session + focused -> studying', deriveMood(working, false, false), 'studying')
check('session + on a feed -> distracted', deriveMood(working, false, true), 'distracted')
check('idle beats distracted', deriveMood(working, true, true), 'sleeping')

const noSession = state()
// Scrolling on your own time is nobody's business.
check('no session + on a feed -> idle', deriveMood(noSession, false, true), 'idle')

// -- health drain ----------------------------------------------------------

function drainOverTenMinutes(distracted: boolean): number {
  const s = withSession(state())
  s.pet.health = 10
  s.pet.lastDecayAt = Date.now() - 10 * 60_000
  tickPet(s, Date.now(), false, distracted)
  return Number((10 - s.pet.health).toFixed(3))
}

const calm = drainOverTenMinutes(false)
const scrolling = drainOverTenMinutes(true)
check('distraction drains health faster', scrolling > calm * 2, true)
console.log(`      (10 min focused = ${calm} pips, 10 min scrolling = ${scrolling} pips)`)

const floored = withSession(state())
floored.pet.health = 3.1
floored.pet.lastDecayAt = Date.now() - 6 * 60 * 60_000
tickPet(floored, Date.now(), false, true)
check('health never drops below the floor', floored.pet.health >= 3, true)

// -- what the cat says -----------------------------------------------------

function nudgeText(distracted: boolean): string {
  const s = withSession(state())
  s.settings.talkativeness = 1
  s.runtime.lastNudgeAt = 0
  tickNudges(s, Date.now(), false, distracted)
  return s.bubbles[0]?.text ?? '(silence)'
}

const praise = nudgeText(false)
const called = nudgeText(true)
check('focused -> some encouragement', praise !== '(silence)', true)
check('on a feed -> not encouragement', called !== praise, true)
console.log(`      focused:  "${praise}"`)
console.log(`      scrolling: "${called}"`)

function nudgeActions(distracted: boolean): string[] {
  const s = withSession(state())
  s.settings.talkativeness = 1
  s.runtime.lastNudgeAt = 0
  tickNudges(s, Date.now(), false, distracted)
  return (s.bubbles[0]?.actions ?? []).map((a) => a.label)
}
check('the distracted bubble can be answered', nudgeActions(true).length > 0, true)
console.log(`      buttons: ${nudgeActions(true).join(' / ')}`)

// "five more minutes" must actually buy five quiet minutes.
const snoozed = withSession(state())
snoozed.settings.talkativeness = 1
snoozed.runtime.lastNudgeAt = 0
snoozed.runtime.doomscrollSnoozeUntil = Date.now() + 5 * 60_000
tickNudges(snoozed, Date.now(), false, true)
check('a granted five minutes is respected', snoozed.bubbles.length, 0)

// -- silence ---------------------------------------------------------------

const quiet = withSession(state())
quiet.settings.talkativeness = 0
quiet.runtime.lastNudgeAt = 0
tickNudges(quiet, Date.now(), false, false)
check('talkativeness 0 means silent', quiet.bubbles.length, 0)

const busy = withSession(state())
busy.settings.talkativeness = 1
busy.runtime.lastNudgeAt = 0
busy.bubbles = [
  { id: 'r', kind: 'reminder', text: 'water break?', actions: [], createdAt: Date.now() }
]
tickNudges(busy, Date.now(), false, false)
check('never talks over an existing bubble', busy.bubbles.length, 1)

console.log(failures === 0 ? '\nall behaviour checks passed' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
