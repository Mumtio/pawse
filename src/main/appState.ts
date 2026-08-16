import type { AppState, ClientState, PersistedState } from '@shared/types'
import { loadState, saveState } from './store'
import { computeInsights } from './insights'
import { broadcast, getCatWindow, getMainWindow } from './windows'

/**
 * Main owns the state. Renderers never mutate it — they send Intents, main
 * applies them, and the resulting state is broadcast to every open window.
 * One shape in, one shape out; no cross-window sync to get wrong.
 */

let state: AppState | null = null

export function initState(): AppState {
  const persisted = loadState()
  state = {
    ...persisted,
    runtime: {
      now: Date.now(),
      idleSeconds: 0,
      catVisible: true,
      mainVisible: true,
      phaseRemainingSec: 0,
      extensionConnected: false,
      llmBusy: false
    }
  }
  return state
}

export function getState(): AppState {
  if (!state) throw new Error('State accessed before init')
  return state
}

function toPersisted(s: AppState): PersistedState {
  const { runtime: _runtime, ...rest } = s
  return rest
}

export function toClientState(s: AppState): ClientState {
  const { log: _log, ...rest } = s
  return { ...rest, insights: computeInsights(s, Date.now()) }
}

/** Push the current state to every window and queue a save. */
export function publish(): void {
  if (!state) return
  const main = getMainWindow()
  const cat = getCatWindow()
  state.runtime.mainVisible = Boolean(main && !main.isDestroyed() && main.isVisible())
  state.runtime.catVisible = Boolean(cat && !cat.isDestroyed() && cat.isVisible())

  broadcast('pawse:state', toClientState(state))
  saveState(toPersisted(state))
}

/** Apply a change and publish it. */
export function mutate(fn: (s: AppState) => void): void {
  fn(getState())
  publish()
}

export function replaceState(next: PersistedState): void {
  const runtime = state?.runtime
  state = {
    ...next,
    runtime: runtime ?? {
      now: Date.now(),
      idleSeconds: 0,
      catVisible: true,
      mainVisible: true,
      phaseRemainingSec: 0,
      extensionConnected: false,
      llmBusy: false
    }
  }
  publish()
}
