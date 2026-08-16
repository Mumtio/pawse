import { useEffect, useState } from 'react'
import type { Personality } from '@shared/types'
import type { Send } from '../App'
import { PixelSprite } from '../cat/PixelSprite'

/**
 * The landing moment. Deliberately two beats and no more — the first thing a
 * study app asks of you should be small.
 *
 * The splash is where the finished intro animation goes; swap the PixelSprite
 * for the sprite sheet and keep the timing.
 */

const PERSONALITIES: Array<{ id: Personality; blurb: string }> = [
  { id: 'calm', blurb: 'quiet company, rarely speaks first' },
  { id: 'studious', blurb: 'keeps track, nudges gently' },
  { id: 'playful', blurb: 'chatty, celebrates everything' },
  { id: 'sleepy', blurb: 'low energy, very cosy' },
  { id: 'encouraging', blurb: 'warm, notices when you return' }
]

const SPLASH_MS = 2600

export function Onboarding({ send }: { send: Send }): React.JSX.Element {
  const [step, setStep] = useState<'splash' | 'name'>('splash')
  const [name, setName] = useState('Moss')
  const [personality, setPersonality] = useState<Personality>('studious')

  useEffect(() => {
    if (step !== 'splash') return
    const id = setTimeout(() => setStep('name'), SPLASH_MS)
    return () => clearTimeout(id)
  }, [step])

  if (step === 'splash') {
    return (
      <div className="onboard" onClick={() => setStep('name')}>
        <div className="onboard-splash">
          <PixelSprite mood="idle" scale={10} />
          <h1 className="onboard-title">Pawse</h1>
          <p className="muted">a calm, no-shame study companion</p>
          <p className="faint onboard-skip">click to continue</p>
        </div>
      </div>
    )
  }

  return (
    <div className="onboard">
      <form
        className="onboard-card"
        onSubmit={(e) => {
          e.preventDefault()
          void send({ type: 'onboard:complete', name, personality })
        }}
      >
        <PixelSprite mood="curious" scale={7} />
        <h2>who's this, then?</h2>

        <label className="stack" style={{ width: '100%' }}>
          <span className="label">name</span>
          <input
            className="field"
            value={name}
            maxLength={20}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Moss"
          />
        </label>

        <div className="stack" style={{ width: '100%' }}>
          <span className="label">personality</span>
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="mode-option"
              aria-pressed={personality === p.id}
              onClick={() => setPersonality(p.id)}
            >
              <span className="radio" />
              <span className="mode-name">{p.id}</span>
              <span className="muted">{p.blurb}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-primary" type="submit" style={{ alignSelf: 'stretch' }}>
          let's begin
        </button>
        <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
          everything stays on this computer. you can change all of this later.
        </p>
      </form>
    </div>
  )
}
