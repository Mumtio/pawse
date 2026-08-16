import type { ClientState } from '@shared/types'
import { MAX_PIPS } from '@shared/types'
import type { Send } from '../App'
import { Pips } from './Pips'

const FOOD_GLYPHS: Record<string, string> = {
  fish: '🐟',
  onigiri: '🍙',
  milk: '🥛',
  biscuit: '🍪',
  mackerel: '🐠'
}

/**
 * Where finished work turns back into something for the cat.
 *
 * Food is only ever earned by doing real things, and feeding is always a
 * choice the person makes — the cat never demands, and nothing here nags when
 * the bars are low.
 */
export function CatCare({
  state,
  send
}: {
  state: ClientState
  send: Send
}): React.JSX.Element {
  const { pet, inventory } = state
  const food = inventory.filter((i) => i.kind === 'food')
  const sleepy = pet.health <= 4

  return (
    <div className="panel stack">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 'var(--s2)' }}>
          <Pips value={pet.health} max={MAX_PIPS} tone="health" label="health" />
          <Pips value={pet.hunger} max={MAX_PIPS} tone="hunger" label="food" />
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => void send({ type: 'pet:pet' })}>
          pet {pet.name}
        </button>
      </div>

      {/* Low states are described as sleepy, never as sick or failing. */}
      {sleepy && (
        <p className="setting-hint">
          {pet.name} is getting sleepy. a glass of water or a stretch perks them right back up.
        </p>
      )}

      <div className="stack" style={{ gap: 'var(--s2)' }}>
        <span className="label">stash</span>
        {food.length === 0 ? (
          <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
            food turns up while you work — finish a session or a chapter and something will
            appear.
          </p>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {food.map((item) => (
              <button
                key={item.id}
                className="btn btn-sm"
                title={`${item.name} — restores ${item.restores}`}
                onClick={() => void send({ type: 'pet:feed', itemId: item.id })}
              >
                <span aria-hidden="true">{FOOD_GLYPHS[item.icon] ?? '🍪'}</span>
                {item.name}
                {item.qty > 1 && <span className="muted">×{item.qty}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
