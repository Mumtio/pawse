import { randomUUID } from 'node:crypto'
import type { AppState } from '@shared/types'

const GREETING_DURATION_MS = 10_000

/** Add the single, short hello shown when Pawse wakes up. */
export function addStartupGreeting(state: AppState, now = Date.now()): void {
  state.bubbles.push({
    id: randomUUID(),
    kind: 'system',
    text: `${state.pet.name} is here. ready when you are.`,
    actions: [],
    createdAt: now,
    expiresAt: now + GREETING_DURATION_MS
  })
}
