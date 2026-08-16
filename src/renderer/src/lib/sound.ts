import type { SoundCue } from '@shared/types'

/**
 * Chiptune blips, synthesised with the Web Audio API.
 *
 * No audio files: nothing to download, nothing to bundle, nothing to load
 * before the first sound works offline — and square waves at these durations
 * are exactly the register the rest of the interface is drawn in. Recorded
 * samples would sit oddly against 16x16 pixel art.
 */

interface Note {
  freq: number
  /** Offset from the start of the cue, in seconds. */
  at: number
  dur: number
  type?: OscillatorType
  /** Relative loudness, 0..1. */
  level?: number
}

// Roughly a pentatonic set, so overlapping cues never sound sour together.
const A4 = 440
const n = (semitonesFromA4: number): number => A4 * Math.pow(2, semitonesFromA4 / 12)

const CUES: Record<SoundCue, Note[]> = {
  blip: [{ freq: n(4), at: 0, dur: 0.05 }],

  // The cat speaks: two soft notes, like a small "hm?"
  bubble: [
    { freq: n(0), at: 0, dur: 0.06, level: 0.5 },
    { freq: n(5), at: 0.06, dur: 0.08, level: 0.5 }
  ],

  // Something confirmed: a small rise.
  confirm: [
    { freq: n(4), at: 0, dur: 0.06 },
    { freq: n(9), at: 0.06, dur: 0.1 }
  ],

  // Chewing: three short low thuds.
  eat: [
    { freq: n(-12), at: 0, dur: 0.05, type: 'triangle' },
    { freq: n(-10), at: 0.09, dur: 0.05, type: 'triangle' },
    { freq: n(-12), at: 0.18, dur: 0.05, type: 'triangle' }
  ],

  // Petting: a low, warm wobble rather than a beep.
  purr: [
    { freq: n(-17), at: 0, dur: 0.14, type: 'triangle', level: 0.7 },
    { freq: n(-19), at: 0.07, dur: 0.16, type: 'triangle', level: 0.5 }
  ],

  // Finished something: a little four-note climb.
  complete: [
    { freq: n(0), at: 0, dur: 0.07 },
    { freq: n(4), at: 0.07, dur: 0.07 },
    { freq: n(7), at: 0.14, dur: 0.07 },
    { freq: n(12), at: 0.21, dur: 0.16 }
  ],

  // Beginning: two decisive notes.
  start: [
    { freq: n(7), at: 0, dur: 0.07 },
    { freq: n(12), at: 0.08, dur: 0.12 }
  ],

  // Break: the same shape, falling instead of rising.
  break: [
    { freq: n(12), at: 0, dur: 0.08 },
    { freq: n(7), at: 0.08, dur: 0.14 }
  ]
}

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  // Chromium may hand back a suspended context until something user-initiated
  // happens; resuming is harmless when it is already running.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function playCue(cue: SoundCue, volume = 0.6): void {
  const audio = context()
  const notes = CUES[cue]
  if (!audio || !notes) return

  const now = audio.currentTime
  for (const note of notes) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.type = note.type ?? 'square'
    osc.frequency.setValueAtTime(note.freq, now + note.at)

    // A hard square wave with no envelope clicks at both ends; a couple of
    // milliseconds of ramp is the difference between a blip and a pop.
    const peak = Math.max(0, Math.min(1, volume)) * (note.level ?? 1) * 0.14
    const start = now + note.at
    const end = start + note.dur
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.008)
    gain.gain.setValueAtTime(peak, Math.max(start + 0.008, end - 0.02))
    gain.gain.linearRampToValueAtTime(0, end)

    osc.connect(gain).connect(audio.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}
