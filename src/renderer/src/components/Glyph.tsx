/**
 * Hand-drawn 8x8 pixel glyphs for navigation.
 *
 * Deliberately not emoji: emoji render in whatever style the OS ships, which
 * drags a completely different visual language into a pixel interface. These
 * are ours, they scale by whole pixels, and they take the current text colour.
 */

const GLYPHS: Record<string, string[]> = {
  // sun — Today
  today: [
    '...##...',
    '#..##..#',
    '.#####..',
    '.######.',
    '.######.',
    '..####..',
    '#..##..#',
    '...##...'
  ],
  // clock — Focus
  focus: [
    '..####..',
    '.#....#.',
    '#..#...#',
    '#..#...#',
    '#..###.#',
    '#......#',
    '.#....#.',
    '..####..'
  ],
  // book — Quests
  quests: [
    '.######.',
    '.#..#.#.',
    '.#..#.#.',
    '.#..#.#.',
    '.#..#.#.',
    '.#..#.#.',
    '.######.',
    '........'
  ],
  // bell — Reminders
  reminders: [
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '########',
    '........',
    '...##...'
  ],
  // bar chart — Insights
  insights: [
    '........',
    '......#.',
    '..#...#.',
    '..#.#.#.',
    '..#.#.#.',
    '..#.#.#.',
    '.######.',
    '........'
  ],
  // cog — Settings
  settings: [
    '...##...',
    '.######.',
    '.##..##.',
    '##....##',
    '##....##',
    '.##..##.',
    '.######.',
    '...##...'
  ],
  // droplet — water reminder
  water: [
    '...##...',
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '..####..',
    '........'
  ],
  // star — currency
  star: [
    '...##...',
    '...##...',
    '#..##..#',
    '.######.',
    '..####..',
    '..#..#..',
    '.#....#.',
    '........'
  ],
  // speaker with sound waves — audio on
  sound: [
    '....#...',
    '...##...',
    '..###.#.',
    '#####.#.',
    '#####.#.',
    '..###.#.',
    '...##...',
    '....#...'
  ],
  // The same speaker with the waves gone. At 8x8 there isn't room for a
  // legible cross, and present-vs-absent waves is the clearer signal anyway.
  muted: [
    '....#...',
    '...##...',
    '..###...',
    '#####...',
    '#####...',
    '..###...',
    '...##...',
    '....#...'
  ],
  // triangle — treats
  treat: [
    '........',
    '...##...',
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '########',
    '........'
  ]
}

export function Glyph({
  name,
  size = 2,
  title
}: {
  name: keyof typeof GLYPHS | string
  /** Pixel scale — whole numbers only. */
  size?: number
  title?: string
}): React.JSX.Element | null {
  const map = GLYPHS[name]
  if (!map) return null
  const px = Math.max(1, Math.round(size))
  return (
    <svg
      width={8 * px}
      height={8 * px}
      viewBox="0 0 8 8"
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {title && <title>{title}</title>}
      {map.map((row, y) =>
        row
          .split('')
          .map((ch, x) =>
            ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null
          )
      )}
    </svg>
  )
}
