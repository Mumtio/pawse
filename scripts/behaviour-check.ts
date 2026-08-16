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
import {
  createInitialState,
  defaultBlockedSites,
  describeNudgeInterval,
  isBlockedDomain,
  normaliseSite,
  nudgeIntervalMs
} from '../src/shared/defaults'
import { deriveMood, tickPet } from '../src/main/pet'
import { tickNudges } from '../src/main/nudges'
import { computeInsights, recordSiteTime } from '../src/main/insights'
import { autoPauseReason } from '../src/main/focus'

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

// -- getting angry ---------------------------------------------------------
//
// The escalation only earns its keep if it stays off for a quick look and
// arrives for a long one. Both directions are checked, because a cat that is
// instantly furious is the same failure as one that never is.

/** A session where the distraction started `minutes` ago. */
function distractedFor(minutes: number): AppState {
  const s = withSession(state())
  s.settings.talkativeness = 1
  s.runtime.lastNudgeAt = 0
  s.runtime.distractedSince = Date.now() - minutes * 60_000
  return s
}

check('a quick look is only unimpressed', deriveMood(distractedFor(1), false, true), 'distracted')
check('a long scroll turns it angry', deriveMood(distractedFor(5), false, true), 'angry')
check('angry needs a session', deriveMood(state(), false, true), 'idle')

function textFor(minutes: number): string {
  const s = distractedFor(minutes)
  tickNudges(s, Date.now(), false, true)
  return s.bubbles[0]?.text ?? '(silence)'
}

const mild = textFor(1)
const furious = textFor(5)
check('the angry lines are their own set', mild !== furious, true)
console.log(`      after 1 min:  "${mild}"`)
console.log(`      after 5 min:  "${furious}"`)

// Shouting is still answerable, and still offers the way out.
const angryBubble = distractedFor(5)
tickNudges(angryBubble, Date.now(), false, true)
const angryActions = (angryBubble.bubbles[0]?.actions ?? []).map((a) => a.label)
check('even the angry bubble can be answered', angryActions.length, 2)
console.log(`      buttons: ${angryActions.join(' / ')}`)

// A granted five minutes outranks the anger, or the promise means nothing.
const angrySnoozed = distractedFor(5)
angrySnoozed.runtime.doomscrollSnoozeUntil = Date.now() + 5 * 60_000
tickNudges(angrySnoozed, Date.now(), false, true)
check('anger still honours a granted five minutes', angrySnoozed.bubbles.length, 0)

// -- which sites count -----------------------------------------------------

check('a default site is distracting', isBlockedDomain('youtube.com', defaultBlockedSites, []), true)
check(
  'subdomains count too',
  isBlockedDomain('m.youtube.com', defaultBlockedSites, []),
  true
)
check('an unlisted site is not', isBlockedDomain('wikipedia.org', defaultBlockedSites, []), false)
check(
  'a study site wins over a blocked one',
  isBlockedDomain('youtube.com', defaultBlockedSites, ['youtube.com']),
  false
)
check('a removed site stops counting', isBlockedDomain('youtube.com', [], []), false)
check('a site you added counts', isBlockedDomain('news.ycombinator.com', ['ycombinator.com'], []), true)
// A near-miss must not match: "notyoutube.com" ends with the same characters
// but is a different site, which is exactly what the leading dot guards.
check('a lookalike domain does not match', isBlockedDomain('notyoutube.com', ['youtube.com'], []), false)

check('a pasted URL becomes a host', normaliseSite('https://www.Reddit.com/r/all?x=1'), 'reddit.com')
check('a port is dropped', normaliseSite('localhost.dev:3000'), 'localhost.dev')
check('a bare word is rejected', normaliseSite('study'), '')
check('whitespace alone is rejected', normaliseSite('   '), '')

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

// -- insights --------------------------------------------------------------
//
// "Where the time went" and the day strip both shipped reading from sources
// that were never written to, so they were permanently empty. These check the
// wiring end to end rather than the formatting.

const startOfToday = new Date().setHours(0, 0, 0, 0)

function withSiteTime(): AppState {
  const s = state()
  s.siteTime = {
    [String(startOfToday)]: {
      'youtube.com': 42 * 60_000,
      'notion.so': 90 * 60_000,
      'wikipedia.org': 10 * 60_000
    }
  }
  s.settings.blockedSites = ['youtube.com']
  s.settings.studySites = ['notion.so']
  return s
}

const withSites = computeInsights(withSiteTime(), Date.now())
check('time per site is reported at all', withSites.topDomains.length, 3)
check('the biggest site comes first', withSites.topDomains[0].domain, 'notion.so')
check(
  'a blocked site is marked blocked',
  withSites.topDomains.find((d) => d.domain === 'youtube.com')?.blocked,
  true
)
check(
  'a study site is not',
  withSites.topDomains.find((d) => d.domain === 'notion.so')?.blocked,
  false
)
check('blocked time is totalled', withSites.distractedMinutesWeek, 42)
check(
  'the worst site is named in an observation',
  withSites.observations.some((o) => o.includes('youtube.com')),
  true
)

// Reclassifying a site must rewrite its history, not just its future.
const reclassified = withSiteTime()
reclassified.settings.studySites = ['notion.so', 'youtube.com']
check(
  'moving a site to study clears its distracted time',
  computeInsights(reclassified, Date.now()).distractedMinutesWeek,
  0
)

// The strip has to fill in during a session, not only once it has ended.
const live = withSession(state())
live.session!.startedAt = Date.now() - 30 * 60_000
const liveStrip = computeInsights(live, Date.now()).dayStrip
check('a running session shows on the day strip', liveStrip.some((s) => s.state === 'focused'), true)
check('the day strip is never empty', liveStrip.length > 0, true)

// A session at 3am must appear somewhere rather than fall outside the window.
const nightOwl = withSession(state())
const threeAm = startOfToday + 3 * 3_600_000
nightOwl.session!.startedAt = threeAm
const nightStrip = computeInsights(nightOwl, threeAm + 40 * 60_000).dayStrip
check(
  'a session outside 9-to-9 still shows',
  nightStrip.some((s) => s.state === 'focused'),
  true
)

// The write half of the pair, driven the way the extension actually drives it:
// a report every five seconds. Seeding siteTime by hand proves the panel can
// render; only this proves anything ever fills it in.
const reported = state()
reported.settings.blockedSites = ['youtube.com']
reported.settings.studySites = ['notion.so']
const clock = Date.now()
// Twelve reports of five seconds each = one minute on each site.
for (let i = 0; i < 12; i++) {
  recordSiteTime(reported, 'youtube.com', 5000, clock)
  recordSiteTime(reported, 'notion.so', 5000, clock)
}
const fromReports = computeInsights(reported, clock)
check('reported time reaches the panel', fromReports.topDomains.length, 2)
check('a minute of reports reads as a minute', fromReports.topDomains[0].minutes, 1)
check('and lands in the blocked total', fromReports.distractedMinutesWeek, 1)

// Nothing on either list is never named, so an unlisted site cannot leak in
// through this path even if one were somehow reported.
const empty = state()
recordSiteTime(empty, '', 5000, clock)
check('a nameless report is dropped', Object.keys(empty.siteTime).length, 0)

// Buckets older than the retention window must not pile up forever.
const old = state()
recordSiteTime(old, 'youtube.com', 60_000, clock - 30 * 86_400_000)
recordSiteTime(old, 'youtube.com', 60_000, clock)
check('stale day buckets are pruned', Object.keys(old.siteTime).length, 1)

// -- the clock stops when the cat is angry ---------------------------------
//
// A timer that keeps counting focused minutes while you scroll is lying about
// how the session went, so anger stops it. The checks that matter are the ones
// proving it does NOT stop for anything less.

check('a quick look does not stop the clock', autoPauseReason(distractedFor(1), Date.now(), false), null)
check('a long scroll stops the clock', autoPauseReason(distractedFor(5), Date.now(), false), 'feed')
check('stepping away still stops it', autoPauseReason(withSession(state()), Date.now(), true), 'away')
check('focused work never stops it', autoPauseReason(withSession(state()), Date.now(), false), null)
// Being away is reported as away even mid-scroll: you are not at the machine,
// which is the more accurate of the two and the one that reads without blame.
check('away outranks the feed', autoPauseReason(distractedFor(5), Date.now(), true), 'away')
check('no session, nothing to pause', autoPauseReason(state(), Date.now(), true), null)

// Saying "back to work" has to restart the clock, not just quiet the cat.
const cameBack = distractedFor(5)
cameBack.runtime.distractedSince = undefined
check('coming back restarts the clock', autoPauseReason(cameBack, Date.now(), false), null)

// -- how often the cat speaks ----------------------------------------------

check('silence is described as silence', describeNudgeInterval(0).includes('never'), true)
check('chattiest is well under a minute', nudgeIntervalMs(1) < 60_000, true)
check('quietest is several minutes', nudgeIntervalMs(0) >= 10 * 60_000, true)
check('more talkative means a shorter gap', nudgeIntervalMs(1) < nudgeIntervalMs(0.5), true)

console.log(failures === 0 ? '\nall behaviour checks passed' : `\n${failures} FAILED`)
if (failures > 0) process.exitCode = 1
