import type { CatMood } from '@shared/types'

/**
 * The cat, drawn as readable character maps so the art lives in source and can
 * be tweaked by hand a pixel at a time.
 *
 *   . transparent   ~ erase (layers only)   o outline   f fur   w belly
 *   e eye           p nose                  b book      q water
 *   d bowl          z sleep
 *
 * Poses are built by overlaying small sparse layers (a face, a prop) onto a
 * body, rather than by copying a whole 16x16 grid per frame. A blink is then
 * one line instead of sixteen, and fixing the nose fixes it everywhere.
 *
 * Two things that matter at this size: eyes are 2px wide, because a single
 * pixel reads as a smudge rather than an expression; and open vs shut is a
 * change of *shape* (a tall block becoming a wide thin line), not just of
 * position, because at 16x16 there is no room for anything subtler.
 *
 * When the real sprite sheet lands, point <PixelSprite sheet="..."> at it —
 * the component already takes an image instead, and the timings below are the
 * ones to match.
 *
 * `node scripts/preview-sprites.mjs out.png` renders every frame to one sheet.
 */

export const SPRITE_SIZE = 16

export const PALETTE: Record<string, string> = {
  o: '#191b33',
  f: '#e8a33d',
  w: '#f2e7d0',
  e: '#191b33',
  p: '#d97c79',
  b: '#8cbf69',
  q: '#7fa9d9',
  d: '#d97c79',
  z: '#a5a3c4',
  // Cross fur and the alert mark, for the one unimpressed pose.
  r: '#d2685f',
  x: '#c94a44'
}

type Grid = string[]

const BLANK = '................'

/** Build a sparse layer from just the rows that have anything in them. */
function layer(rows: Record<number, string>): Grid {
  return Array.from({ length: SPRITE_SIZE }, (_, y) => rows[y] ?? BLANK)
}

/** Paint `over` onto `base`. '.' passes through, '~' erases. */
function stack(base: Grid, ...layers: Grid[]): Grid {
  return layers.reduce(
    (acc, over) =>
      acc.map((row, y) =>
        row
          .split('')
          .map((ch, x) => {
            const top = over[y][x]
            if (top === '.') return ch
            if (top === '~') return '.'
            return top
          })
          .join('')
      ),
    base
  )
}

/** Move a grid vertically; rows pushed off the edge are dropped. */
function shift(grid: Grid, dy: number): Grid {
  return Array.from({ length: SPRITE_SIZE }, (_, y) => grid[y - dy] ?? BLANK)
}

/** Swap one colour for another across a whole pose. */
function recolor(grid: Grid, from: string, to: string): Grid {
  return grid.map((row) => row.split(from).join(to))
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/**
 * Sitting. Head occupies rows 4–10 with the nose on row 9, so the face has
 * room to be expressive; the belly is kept to three rows so that block of
 * cream doesn't out-shout it.
 */
const SITTING: Grid = [
  '................',
  '...o........o...',
  '..ofo......ofo..',
  '..offo....offo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffppffffo..',
  '..offffffffffo..',
  '.offffffffffffo.',
  '.offwwwwwwwwffo.',
  '.offwwwwwwwwffo.',
  '.offfwwwwwwfffo.',
  '..oooooooooooo..'
]

/** Curled low and wide, for sleeping. */
const CURLED: Grid = [
  '................',
  '................',
  '................',
  '................',
  '...o........o...',
  '..ofo......ofo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffppffffo..',
  '.offffffffffffo.',
  'offwwwwwwwwwwffo',
  'offwwwwwwwwwwffo',
  'offwwwwwwwwwwffo',
  '.offwwwwwwwwffo.',
  '..oooooooooooo..'
]

/**
 * Held by the scruff: ears back, body tapering to a narrow waist, and both
 * front legs hanging free with daylight between them. The gap is what sells
 * it — legs that still touch the ground read as standing.
 */
const DANGLING: Grid = [
  '................',
  '................',
  '.oo..........oo.',
  '..offo....offo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffppffffo..',
  '..offffffffffo..',
  '...offffffffo...',
  '...offwwwwffo...',
  '...offwwwwffo...',
  '....ofo..ofo....',
  '....ooo..ooo....'
]

/** The same cat pulled a row taller, mid-stretch. */
const STRETCHED: Grid = [
  '...o........o...',
  '..ofo......ofo..',
  '..offo....offo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffffffffo..',
  '..offffppffffo..',
  '..offffffffffo..',
  '.offffffffffffo.',
  '.offwwwwwwwwffo.',
  '.offwwwwwwwwffo.',
  '.offwwwwwwwwffo.',
  '.offfwwwwwwfffo.',
  '..oooooooooooo..'
]

// ---------------------------------------------------------------------------
// Faces — eyes on rows 6–7, nose row 9, mouth row 10 (relative to SITTING)
// ---------------------------------------------------------------------------

const EYES_OPEN = layer({ 6: '....ee....ee....', 7: '....ee....ee....' })
const EYES_WIDE = layer({ 6: '...eee....eee...', 7: '...eee....eee...' })
/** Shut is wide and thin — the shape change is what reads, not the position. */
const EYES_SHUT = layer({ 7: '...eeee..eeee...' })
/** A heavy lid with a sliver of eye left under it. */
const EYES_HEAVY = layer({ 6: '...eeee..eeee...', 7: '....ee....ee....' })
const EYES_HAPPY = layer({ 6: '.....e....e.....', 7: '....e.e..e.e....' })
const EYES_LEFT = layer({ 6: '...ee....ee.....', 7: '...ee....ee.....' })
const EYES_RIGHT = layer({ 6: '.....ee....ee...', 7: '.....ee....ee...' })
/** Cast down at whatever is on the desk. */
const EYES_READING = layer({ 7: '....ee....ee....', 8: '....ee....ee....' })

const MOUTH_OPEN = layer({ 10: '.......oo.......' })
const MOUTH_SMILE = layer({ 10: '......oooo......' })

/** Trims the ear tips — small, but it does most of the work of "tired". */
const EARS_DROOPED = layer({ 1: '...~........~...' })

/** Heavy brows angled down toward the nose: unimpressed, not furious. */
const EYES_CROSS = layer({
  5: '...ee......ee...',
  6: '....ee....ee....',
  7: '....ee....ee....'
})

/**
 * Furious, and it has to read at 16px: the brows run the full width and meet
 * over the nose, and the eyes narrow to slits under them. A steeper version of
 * EYES_CROSS rather than a different idea, so escalation looks like the same
 * cat getting crosser instead of a second character.
 */
const EYES_FURIOUS = layer({
  5: '..eee......eee..',
  6: '...eee....eee...',
  7: '....ee....ee....'
})

/** A flat, unamused line. */
const MOUTH_FLAT = layer({ 10: '.....oooooo.....' })

/**
 * Wide open, mid-shout. Three rows with the inside showing and a closed bottom
 * edge — without that edge the dark blob runs straight into the belly and reads
 * as a beard rather than a mouth.
 */
const MOUTH_SHOUT = layer({
  10: '.....oooooo.....',
  11: '.....oppppo.....',
  12: '......oooo......'
})

/** An exclamation mark floating beside the head. */
const ALERT = layer({
  1: '..............x.',
  2: '..............x.',
  3: '..............x.',
  5: '..............x.'
})

/** Two of them, one either side, for when one is not enough. */
const ALERT_DOUBLE = stack(
  ALERT,
  layer({
    1: '.x..............',
    2: '.x..............',
    3: '.x..............',
    5: '.x..............'
  })
)

/** Steam off the ears. Small, but it's what tips cross over into angry. */
const STEAM_A = layer({ 0: '..x........x....', 1: '.x..........x...' })
const STEAM_B = layer({ 0: '.x..........x...', 1: '..x........x....' })

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Held up in front, tall enough to actually read as a book. */
const BOOK = layer({
  11: '.obbbbbbbbbbbbo.',
  12: 'obwwwwwoowwwwwbo',
  13: 'obwwwwwoowwwwwbo',
  14: 'obwwwwwoowwwwwbo',
  15: '.oooooooooooooo.'
})

const DROPLET = layer({
  0: '..............q.',
  1: '.............qqq',
  2: '..............q.'
})

const BOWL = layer({
  13: '...dddddddddd...',
  14: '...dwwwwwwwwd...',
  15: '...oooooooooo...'
})

const ZS_LOW = layer({ 1: '............zzz.', 2: '.............z..', 3: '............zzz.' })
const ZS_HIGH = layer({ 0: '............zzz.', 1: '.............z..', 2: '............zzz.' })

/** The curled body sits lower, so sleeping gets its own eye row. */
const CURLED_SHUT = layer({ 7: '...eeee..eeee...' })

// ---------------------------------------------------------------------------
// Moods
// ---------------------------------------------------------------------------

export interface Frame {
  rows: Grid
  /** How long this frame holds, in ms. */
  ms: number
}

export interface MoodSprite {
  frames: Frame[]
  caption: string
}

const f = (rows: Grid, ms: number): Frame => ({ rows, ms })

const IDLE_OPEN = stack(SITTING, EYES_OPEN)
const IDLE_SHUT = stack(SITTING, EYES_SHUT)

const STUDY_DOWN = stack(SITTING, BOOK, EYES_READING)
const STUDY_UP = stack(SITTING, BOOK, EYES_OPEN)

const TIRED_HEAVY = stack(SITTING, EARS_DROOPED, EYES_HEAVY)
const TIRED_SHUT = stack(SITTING, EARS_DROOPED, EYES_SHUT)

const ASLEEP_A = stack(CURLED, CURLED_SHUT, ZS_LOW)
const ASLEEP_B = stack(CURLED, CURLED_SHUT, ZS_HIGH)

const HELD_A = stack(DANGLING, EYES_WIDE, MOUTH_OPEN)
const HELD_B = stack(
  DANGLING,
  EYES_WIDE,
  MOUTH_OPEN,
  // The legs swing a pixel as it sways.
  layer({ 14: '....~~~..~~~....', 15: '....~~~..~~~....' }),
  layer({ 14: '.....ofo..ofo...', 15: '.....ooo..ooo...' })
)

const EAT_OPEN = stack(SITTING, BOWL, EYES_SHUT, MOUTH_OPEN)
const EAT_SHUT = stack(SITTING, BOWL, EYES_SHUT)

const HAPPY_DOWN = stack(SITTING, EYES_HAPPY, MOUTH_SMILE)
/** Same pose, a pixel off the ground — the little hop after being fed. */
const HAPPY_UP = shift(HAPPY_DOWN, -1)

const DRINK_A = stack(SITTING, DROPLET, EYES_SHUT, MOUTH_OPEN)
const DRINK_B = stack(SITTING, DROPLET, EYES_OPEN)

const STRETCH_TALL = stack(STRETCHED, shift(EYES_SHUT, -1))

/**
 * The one unhappy face: ears back, brows down, flat mouth, fur gone red, and
 * an exclamation mark that blinks so it catches the eye from across a screen.
 * Reserved strictly for "a session is running and you're on a feed" — it never
 * appears for a missed reminder, a low bar, or a day off.
 */
const CROSS_BASE = stack(
  recolor(SITTING, 'f', 'r'),
  layer({ 1: '...~........~...', 2: '.rr..........rr.' }),
  EYES_CROSS,
  MOUTH_FLAT
)
const CROSS_ALERT = stack(CROSS_BASE, ALERT)

/**
 * Properly angry — the escalation of the pose above, for when the check-in has
 * already been ignored. Deeper red, ears fully back, brows meeting, mouth open
 * mid-shout, steam. It shakes by a pixel because a still frame at this size
 * reads as a drawing of anger rather than as anger.
 */
const ANGRY_BASE = stack(
  recolor(SITTING, 'f', 'x'),
  recolor(
    layer({ 1: '...~........~...', 2: '.rr..........rr.' }),
    'r',
    'x'
  ),
  EYES_FURIOUS,
  MOUTH_SHOUT
)
const ANGRY_A = stack(ANGRY_BASE, ALERT_DOUBLE, STEAM_A)
/** Same pose jolted a pixel sideways, with the steam on its other beat. */
const ANGRY_B = stack(
  ANGRY_BASE.map((row) => row.slice(1) + '.'),
  ALERT_DOUBLE,
  STEAM_B
)

export const MOOD_SPRITES: Record<CatMood, MoodSprite> = {
  // A long hold then a fast shut is what makes a blink read as a blink.
  idle: {
    caption: 'idle',
    frames: [f(IDLE_OPEN, 3200), f(IDLE_SHUT, 130), f(IDLE_OPEN, 500), f(IDLE_SHUT, 130)]
  },

  studying: {
    caption: 'studying',
    frames: [f(STUDY_DOWN, 2400), f(STUDY_UP, 900), f(STUDY_DOWN, 3000), f(STUDY_UP, 600)]
  },

  break: {
    caption: 'on a break',
    frames: [
      f(IDLE_OPEN, 1400),
      f(stack(SITTING, EYES_LEFT), 1100),
      f(IDLE_OPEN, 900),
      f(stack(SITTING, EYES_RIGHT), 1100)
    ]
  },

  drowsy: {
    caption: 'sleepy',
    frames: [f(TIRED_HEAVY, 2200), f(TIRED_SHUT, 900), f(TIRED_HEAVY, 1600), f(TIRED_SHUT, 1400)]
  },

  sleeping: {
    caption: 'asleep',
    frames: [f(ASLEEP_A, 1500), f(ASLEEP_B, 1500)]
  },

  held: {
    caption: 'dangling',
    frames: [f(HELD_A, 340), f(HELD_B, 340)]
  },

  eating: {
    caption: 'eating',
    frames: [f(EAT_OPEN, 190), f(EAT_SHUT, 190)]
  },

  celebrating: {
    caption: 'pleased',
    frames: [f(HAPPY_UP, 170), f(HAPPY_DOWN, 200), f(HAPPY_UP, 170), f(HAPPY_DOWN, 620)]
  },

  drinking: {
    caption: 'drinking',
    frames: [f(DRINK_A, 320), f(DRINK_B, 420)]
  },

  stretching: {
    caption: 'stretching',
    frames: [f(IDLE_OPEN, 400), f(STRETCH_TALL, 900), f(IDLE_OPEN, 500)]
  },

  distracted: {
    caption: 'unimpressed',
    frames: [f(CROSS_ALERT, 520), f(CROSS_BASE, 380)]
  },

  // Faster than any other loop on purpose: the twitch is the tell.
  angry: {
    caption: 'furious',
    frames: [f(ANGRY_A, 200), f(ANGRY_B, 200)]
  },

  curious: {
    caption: 'curious',
    frames: [f(stack(SITTING, EYES_WIDE), 900), f(stack(SITTING, EYES_WIDE, MOUTH_OPEN), 500)]
  }
}

// A miscounted row is invisible until it renders wrong, so check once here.
if (import.meta.env.DEV) {
  for (const [mood, spec] of Object.entries(MOOD_SPRITES)) {
    spec.frames.forEach((frame, i) => {
      if (frame.rows.length !== SPRITE_SIZE) {
        console.error(`[sprites] ${mood} frame ${i} has ${frame.rows.length} rows`)
      }
      frame.rows.forEach((row, y) => {
        if (row.length !== SPRITE_SIZE) {
          console.error(`[sprites] ${mood} frame ${i} row ${y} is ${row.length} wide: "${row}"`)
        }
      })
    })
  }
}
