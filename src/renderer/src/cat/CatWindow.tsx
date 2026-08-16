import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bubble } from '@shared/types'
import { MAX_PIPS } from '@shared/types'
import { PixelSprite } from './PixelSprite'
import { usePawse, formatClock } from '../lib/usePawse'
import { playCue } from '../lib/sound'
import { Pips } from '../components/Pips'

const DRAG_THRESHOLD_PX = 4
/** A few pixels of forgiveness so the cat is grabbable at its edges. */
const HIT_SLOP = 6

/** Must stay in step with CAT_SIZES in main/windows.ts. */
const CAT_SPRITE_SCALE: Record<'S' | 'M' | 'L', number> = { S: 5, M: 6, L: 8 }

export function CatWindow(): React.JSX.Element | null {
  const { state, send } = usePawse()

  const shellRef = useRef<HTMLDivElement>(null)
  const interactiveRef = useRef(false)
  const draggingRef = useRef(false)

  /**
   * Cached rects of the interactive regions. Hit-testing against these is
   * plain arithmetic; calling elementFromPoint on every forwarded mousemove
   * forces a layout recalc each time and makes dragging stutter.
   */
  const rectsRef = useRef<DOMRect[]>([])

  const [dragging, setDragging] = useState(false)

  const measure = useCallback(() => {
    const nodes = shellRef.current?.querySelectorAll('[data-interactive]')
    rectsRef.current = nodes ? [...nodes].map((n) => n.getBoundingClientRect()) : []
  }, [])

  // Re-measure on every state push. Two getBoundingClientRect calls a second
  // is nothing, and it means the hit area can never go stale after a layout
  // change we forgot to list as a dependency.
  useLayoutEffect(() => {
    measure()
  }, [measure, state])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  /**
   * The cat window is the only audio host. Main broadcasts each cue to every
   * open window, so if the dashboard listened too you'd hear everything twice
   * whenever it happened to be open. This window always exists while the app
   * is running, even when hidden.
   */
  useEffect(() => window.pawse.onSound(({ cue, volume }) => playCue(cue, volume)), [])

  const setInteractive = useCallback((next: boolean) => {
    if (interactiveRef.current === next) return
    interactiveRef.current = next
    window.pawse.setCatInteractive(next)
  }, [])

  /**
   * The window ignores mouse events by default so it never blocks the work
   * underneath. Electron still forwards move events, so we hit-test the cursor
   * against the cached rects and only then accept clicks.
   *
   * This runs synchronously on every move, and it must. Deferring it to the
   * next animation frame means a fast move-and-click lands while the window is
   * still click-through, and the press goes to whatever is behind the cat —
   * which reads as the cat randomly refusing to be picked up. Comparing a
   * point against two cached rects is arithmetic; it's the elementFromPoint
   * call this replaced that was expensive.
   */
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (draggingRef.current) return
      const x = e.clientX
      const y = e.clientY
      const hit = rectsRef.current.some(
        (r) =>
          x >= r.left - HIT_SLOP &&
          x <= r.right + HIT_SLOP &&
          y >= r.top - HIT_SLOP &&
          y <= r.bottom + HIT_SLOP
      )
      setInteractive(hit)
    }

    const onLeave = (): void => {
      if (!draggingRef.current) setInteractive(false)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [setInteractive])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    // Capture on the stable container, never on e.target — the target is a
    // rect inside the sprite, and the idle animation replaces those mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    setDragging(true)
    setInteractive(true)
    // Main works out the grab offset itself and drives the window from there.
    window.pawse.startCatDrag()
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    e.currentTarget.releasePointerCapture?.(e.pointerId)

    void window.pawse.endCatDrag().then(({ moved }) => {
      // A press that barely travelled is a pet, not a drag. One gesture, two
      // meanings, decided by how far the cursor actually went.
      if (moved < DRAG_THRESHOLD_PX) void send({ type: 'pet:pet' })
      measure()
    })
  }

  if (!state) return null

  const { pet, session, runtime, bubbles, settings } = state
  const bubble = bubbles[0]
  const showHud = Boolean(session) && settings.showHud

  return (
    <div className="cat-shell" ref={shellRef}>
      {bubble && <SpeechBubble bubble={bubble} onAction={send} />}

      <div
        className={`cat-body${dragging ? ' is-dragging' : ''}`}
        data-interactive="true"
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => void send({ type: 'window:showMain' })}
        title={`${pet.name} — drag to move, click to pet, double-click to open Pawse`}
      >
        {showHud && (
          <div className="cat-hud">
            <span className="cat-hud-time">{formatClock(runtime.phaseRemainingSec)}</span>
            <span className="cat-hud-phase">{session?.phase === 'break' ? 'break' : 'focus'}</span>
          </div>
        )}

        {/* Picking the cat up is a local gesture — it dangles the instant you
            grab it, without waiting on a round-trip to main. */}
        <PixelSprite
          mood={dragging ? 'held' : pet.mood}
          scale={CAT_SPRITE_SCALE[settings.catSize] ?? 6}
        />

        <div className="cat-bars">
          <Pips value={pet.health} max={MAX_PIPS} tone="health" label="health" compact />
          <Pips value={pet.hunger} max={MAX_PIPS} tone="hunger" label="food" compact />
        </div>
      </div>
    </div>
  )
}

function SpeechBubble({
  bubble,
  onAction
}: {
  bubble: Bubble
  onAction: (intent: Bubble['actions'][number]['intent']) => void
}): React.JSX.Element {
  return (
    <div className="bubble stamp" data-interactive="true">
      {/* Always present. Anything the cat says can be waved off, including
          the remarks that would otherwise just fade on their own. */}
      <button
        className="bubble-close"
        aria-label="dismiss"
        title="dismiss"
        onClick={() => onAction({ type: 'bubble:dismiss', bubbleId: bubble.id })}
      >
        ×
      </button>

      <p className="bubble-text">{bubble.text}</p>

      {bubble.actions.length > 0 && (
        <div className="bubble-actions">
          {bubble.actions.map((action) => (
            <button
              key={action.id}
              className="btn btn-sm btn-cream"
              onClick={() => onAction(action.intent)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
