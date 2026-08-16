import { memo, useEffect, useMemo, useState } from 'react'
import type { CatMood } from '@shared/types'
import { MOOD_SPRITES, PALETTE, SPRITE_SIZE } from './sprites'

/**
 * Renders a character-map sprite as crisp SVG rects, or a real sprite sheet
 * once one exists. Scale is always a whole number — half-pixels are how pixel
 * art starts looking like a blurry photo of pixel art.
 *
 * Frames advance on their own individual durations rather than a fixed
 * interval, which is what lets a blink be a long hold and a fast shut instead
 * of a steady flicker.
 *
 * Memoised because main broadcasts state once a second: without this, ~150
 * rects would be rebuilt on every tick.
 */
export const PixelSprite = memo(function PixelSprite({
  mood,
  scale = 6,
  sheet,
  paused = false
}: {
  mood: CatMood
  scale?: number
  /** Optional PNG to use instead of the placeholder maps. */
  sheet?: string
  /** Hold the current frame. */
  paused?: boolean
}): React.JSX.Element {
  const spec = MOOD_SPRITES[mood] ?? MOOD_SPRITES.idle
  const [frame, setFrame] = useState(0)

  // Start each mood from the top so a pose never opens mid-gesture.
  useEffect(() => {
    setFrame(0)
  }, [mood])

  useEffect(() => {
    if (paused || spec.frames.length < 2) return
    let timer: ReturnType<typeof setTimeout>
    let current = frame

    const advance = (): void => {
      current = (current + 1) % spec.frames.length
      setFrame(current)
      timer = setTimeout(advance, spec.frames[current].ms)
    }

    timer = setTimeout(advance, spec.frames[frame]?.ms ?? 500)
    return () => clearTimeout(timer)
    // `frame` is intentionally omitted: the chain schedules its own successor,
    // and re-running on every frame change would restart the timer each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, paused])

  const px = Math.max(1, Math.round(scale))
  const size = SPRITE_SIZE * px
  const rows = spec.frames[frame]?.rows ?? spec.frames[0].rows

  const pixels = useMemo(() => {
    const out: React.JSX.Element[] = []
    rows.forEach((row, y) => {
      row.split('').forEach((ch, x) => {
        const fill = PALETTE[ch]
        if (!fill) return
        out.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />)
      })
    })
    return out
  }, [rows])

  if (sheet) {
    return <img className="pixel" src={sheet} width={size} height={size} alt="" draggable={false} />
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`the cat, ${spec.caption}`}
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      {pixels}
    </svg>
  )
})
