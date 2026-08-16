import { randomUUID } from 'node:crypto'
import type { AppState, Bubble, Personality } from '@shared/types'
import { nudgeIntervalMs } from '@shared/defaults'
import { isProperlyAngry } from './pet'

/**
 * The cat speaking up on its own — a check-in, a bit of encouragement, or a
 * nudge back to work when nothing is happening.
 *
 * Two rules shape everything here:
 *
 *  1. It never speaks over something that matters. A reminder, a scroll
 *     check-in, or an unanswered question always wins; nudges fill the silence
 *     rather than competing for it.
 *
 *  2. It nudges, it doesn't scold. "shall we pick something?" gets a person
 *     working; "you've done nothing all day" gets the app uninstalled. The
 *     lines below are deliberately free of guilt, streak-talk, and comparison,
 *     and none of them mention how long you've been unproductive.
 *
 * The lines are written for the cat rather than borrowed from anyone. Quoting
 * famous people means attributing them correctly, and a motivational app that
 * confidently misattributes a quote is worse than one with no quotes.
 */

/** Never within this long of any other bubble. */
const RESPECT_SILENCE_MS = 45_000

/** How soon the cat speaks up once you've drifted onto a feed mid-session. */
const DISTRACTED_INTERVAL_MS = 40_000

/** Angry is more insistent than unimpressed, but still not a stream of abuse. */
const ANGRY_INTERVAL_MS = 25_000

/** Long enough at the keyboard with nothing running to be worth a word. */
const LOITER_MS = 6 * 60_000

/** How long an unprompted remark stays on screen before fading. */
const SPEAK_MS = 12_000

type Context =
  | 'working'
  | 'deep_in_it'
  | 'idle_in_session'
  | 'loitering'
  | 'late_night'
  | 'resting'
  | 'distracted'
  | 'angry'

type Lines = Partial<Record<Personality, string[]>> & { any: string[] }

const LINES: Record<Context, Lines> = {
  // Mid-session, keyboard warm. Short, so it doesn't pull focus.
  working: {
    any: [
      'this is going well.',
      'still here with you.',
      'nice pace.',
      'good. keep going.',
      'one thing at a time. this is the thing.',
      'you showed up. that was the hard part.',
      'no notes. carry on.',
      'i like watching you work.',
      'this counts, even the boring bit.',
      'you are doing the thing you said you would do.',
      'quietly impressed over here.',
      'the page is moving. that is enough.',
      'nobody does this in one go. you are doing it in pieces, which works.',
      'good. now the next small piece.',
      'keeping you company.'
    ],
    calm: ['steady.', 'no rush. just this.', 'breathe. still going.'],
    playful: [
      'look at you go!',
      'we are unstoppable. mostly.',
      'i would high five you but, paws.',
      'this is my favourite show.'
    ],
    sleepy: ['mm. doing great.', "i'm awake. mostly. keep going.", 'so productive. very cosy.'],
    encouraging: [
      "you're further than you were.",
      'this counts. all of it counts.',
      'future you is going to be pleased about this.',
      'progress is not always loud.'
    ],
    studious: [
      'solid work.',
      'the hard part is already behind you.',
      'good method. stay with it.',
      'this is how the difficult things get done.'
    ]
  },

  // Deeper in, past the point where starting was the hard part.
  deep_in_it: {
    any: [
      "you've been going a while. that's the good kind of long.",
      'this is the part that actually moves things.',
      'proud of this stretch.',
      'properly in it now.',
      'this is real work. it looks like this.',
      'long stretch. it counted.'
    ],
    calm: ['deep in it. lovely.'],
    playful: ['ok this is a proper session now.', 'someone is on a roll.'],
    sleepy: ['still going? respect. i would have napped.'],
    encouraging: [
      'whatever happens after, this bit already happened.',
      'nobody can take this stretch back off you.'
    ],
    studious: ['this is where the work gets done. keep at it.', 'momentum. use it.']
  },

  // The session is running but nobody is home.
  idle_in_session: {
    any: [
      'still there? the timer is waiting, not judging.',
      'i paused us. come back whenever.',
      'took a breather? good. ready when you are.'
    ],
    sleepy: ['i may have dozed off. you too?'],
    playful: ['hello? i am talking to a chair.']
  },

  // At the computer, nothing started.
  loitering: {
    any: [
      'shall we pick something small to start?',
      'want to put a timer on something?',
      'even fifteen minutes counts. want to try one?',
      'nothing running. shall we begin?'
    ],
    calm: ['whenever you like, i can start us off.'],
    playful: ['i am ready. suspiciously ready.'],
    sleepy: ['we could start something. or not. but probably something.'],
    encouraging: ['starting is the hard bit. the rest follows.'],
    studious: ["let's pick the next chapter and get into it."]
  },

  late_night: {
    any: [
      "it's late. one more small thing, then bed?",
      'late one. i can stay up, but you probably shouldn\'t.',
      'tomorrow-you would like an early night.'
    ],
    sleepy: ['i am extremely asleep. join me?']
  },

  // Between sessions, recently finished something.
  resting: {
    any: ['that was a good one.', 'rest counts too.', 'ready for another when you are.']
  },

  /**
   * A session is running and you are on a feed. This is the only place the cat
   * is allowed to be direct — it names what is happening and points back at
   * the thing you chose. Still no guilt, no tally, no "you always do this".
   */
  distracted: {
    any: [
      'hey. we were doing something else.',
      'this is not the thing we started.',
      'the timer is still running, you know.',
      'i can see the feed from here.',
      'psst. the work is that way.',
      'we picked a task. this is not it.'
    ],
    calm: ['gently: this is not the task.'],
    playful: ['caught you. come on.', 'the feed will still be there later. it always is.'],
    sleepy: ['even i am more awake than this. come back.'],
    encouraging: ['no harm done. come back and we carry on.'],
    studious: ['back to it. the chapter is waiting.']
  },

  /**
   * Asked once, ignored, still scrolling. The cat is drawn properly furious by
   * now, and a cross face over a mild line reads as a bug — so it raises its
   * voice here, and only here.
   *
   * Angry at the situation, never contemptuous of the person. Everything the
   * rest of the app refuses to do still applies: no tallies, no "you always do
   * this", no comparison, nothing about character. It is a shout to get someone
   * to look up, and every one of these still ends pointing at the way back.
   */
  angry: {
    any: [
      'OI. put it down.',
      'i asked nicely. i am done asking nicely.',
      'HEY. eyes up. the timer is still going.',
      'no. we are not doing this. close the tab.',
      'that is enough of that. back. now.',
      'i am not watching this happen for another minute.',
      'STOP. you picked something. go and do it.',
      'this is the bit you said you did not want to do again.',
      'seriously. shut it and come back.'
    ],
    calm: ['no. not this. close it and come back.', 'i am cross now. close the tab.'],
    playful: [
      'RIGHT. that is it. paws down.',
      'i will sit on the keyboard. do not test me.',
      'hissing. actually hissing.'
    ],
    sleepy: ['you have made me get UP. close it.', 'i woke up for this. close the tab.'],
    encouraging: [
      'no. you are better than this tab and we both know it. come back.',
      'i am angry because you wanted this one. come on.'
    ],
    studious: ['ENOUGH. the chapter is open and waiting.', 'close it. the work is right there.']
  }
}

/** The last few things said, so a chatty cat doesn't repeat itself. */
const recent: string[] = []
const RECENT_MEMORY = 6

function pickLine(context: Context, personality: Personality): string {
  const lines = LINES[context]
  const pool = [...lines.any, ...(lines[personality] ?? [])]
  const fresh = pool.filter((line) => !recent.includes(line))
  const from = fresh.length > 0 ? fresh : pool

  const line = from[Math.floor(Math.random() * from.length)]
  recent.push(line)
  if (recent.length > RECENT_MEMORY) recent.shift()
  return line
}

function chooseContext(
  state: AppState,
  now: number,
  isIdle: boolean,
  isDistracted: boolean
): Context | null {
  const { session, runtime } = state
  const hour = new Date(now).getHours()

  if (session) {
    if (isIdle) return 'idle_in_session'
    // Checked before any encouragement: praising someone mid-scroll is the
    // fastest way to make the whole thing feel fake. "five more minutes" is
    // honoured here too — asking again inside the window you just granted is
    // exactly the nagging this is meant to avoid.
    const snoozed = runtime.doomscrollSnoozeUntil && now < runtime.doomscrollSnoozeUntil
    // Escalates only after the gentler version has had its chance: the same
    // stretch of scrolling, gone on long enough that "psst" clearly didn't
    // land. Snooze still wins — "five more minutes" was granted, so shouting
    // inside the window you just agreed to would be a betrayal, not a nudge.
    if (isDistracted && !snoozed) {
      return isProperlyAngry(state, now) ? 'angry' : 'distracted'
    }
    if (isDistracted) return null
    const elapsed = now - session.startedAt
    return elapsed > 25 * 60_000 ? 'deep_in_it' : 'working'
  }

  // Asleep at the desk isn't a moment for a pep talk.
  if (isIdle) return null

  if (hour >= 23 || hour < 4) return 'late_night'

  const since = runtime.activeSince ?? now
  if (now - since > LOITER_MS) return 'loitering'

  // Just wrapped something up.
  if (state.lastSummary) return 'resting'

  return null
}

export function tickNudges(
  state: AppState,
  now: number,
  isIdle: boolean,
  isDistracted = false
): void {
  const { settings, runtime } = state

  // Track the current unbroken stretch at the keyboard.
  if (isIdle) runtime.activeSince = undefined
  else if (!runtime.activeSince) runtime.activeSince = now

  if (settings.trackingPaused) return
  // Silence means silence.
  if (settings.talkativeness <= 0) return
  // Never talk over something that needs an answer.
  if (state.bubbles.length > 0) return

  // Being pulled off a session you started is worth saying sooner than a
  // routine bit of encouragement.
  const wait =
    isDistracted && state.session
      ? isProperlyAngry(state, now)
        ? ANGRY_INTERVAL_MS
        : DISTRACTED_INTERVAL_MS
      : nudgeIntervalMs(settings.talkativeness)
  const last = runtime.lastNudgeAt ?? 0
  if (now - last < wait) return

  // Give any reminder that just fired room to breathe.
  const lastReminder = Math.max(0, ...state.reminders.map((r) => r.lastFiredAt ?? 0))
  if (now - lastReminder < RESPECT_SILENCE_MS) return

  const context = chooseContext(state, now, isIdle, isDistracted)
  if (!context) return

  runtime.lastNudgeAt = now
  state.bubbles.push(buildNudge(context, state, now))
}

/**
 * If the cat asks a question, there must be a way to answer it.
 *
 * Contexts that end in a question mark get buttons and no expiry — they wait
 * for a reply. Contexts that are plain remarks get neither, and fade on their
 * own so encouragement never becomes another thing to dismiss. Either way the
 * bubble carries a close control, so the cat can always be shooed away.
 */
function buildNudge(context: Context, state: AppState, now: number): Bubble {
  const text = pickLine(context, state.pet.personality)
  const id = randomUUID()
  const base = { id, kind: 'nudge' as const, text, createdAt: now }

  switch (context) {
    case 'loitering':
      return {
        ...base,
        actions: [
          { id: 'open', label: "let's go", intent: { type: 'window:showMain' } },
          { id: 'later', label: 'not yet', intent: { type: 'bubble:dismiss', bubbleId: id } }
        ]
      }

    case 'idle_in_session':
      return {
        ...base,
        actions: [
          { id: 'back', label: "i'm back", intent: { type: 'bubble:dismiss', bubbleId: id } },
          { id: 'stop', label: 'end the session', intent: { type: 'focus:stop' } }
        ]
      }

    case 'distracted':
      return {
        ...base,
        actions: [
          { id: 'return', label: 'back to work', intent: { type: 'doomscroll:return' } },
          {
            id: 'five',
            label: 'five more minutes',
            intent: { type: 'doomscroll:continue', minutes: 5 }
          }
        ]
      }

    /**
     * The way out stays on the table even here. A cat that shouts and leaves
     * you no answer is a cat you close permanently — and someone who genuinely
     * needs five more minutes should still be able to say so, however cross it
     * is about it.
     */
    case 'angry':
      return {
        ...base,
        actions: [
          { id: 'return', label: 'fine, fine', intent: { type: 'doomscroll:return' } },
          {
            id: 'five',
            label: 'i really do need five',
            intent: { type: 'doomscroll:continue', minutes: 5 }
          }
        ]
      }

    case 'late_night':
      return {
        ...base,
        actions: [
          { id: 'one-more', label: 'one more thing', intent: { type: 'bubble:dismiss', bubbleId: id } },
          // The wind-down reminder is already how you tell Pawse you're done
          // for the day, so answering here is the same gesture.
          {
            id: 'winding-down',
            label: 'winding down',
            intent: { type: 'reminder:confirm', reminderId: 'winddown' }
          }
        ]
      }

    default:
      return { ...base, expiresAt: now + SPEAK_MS, actions: [] }
  }
}
