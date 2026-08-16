import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PersistedState } from '@shared/types'
import { createInitialState, defaultSettings, makeBridgeToken, STATE_VERSION } from '@shared/defaults'

/**
 * One JSON file, written atomically (tmp + rename) so a crash mid-write can
 * never leave a truncated file. Everything Pawse knows lives here, which is
 * also what makes "Export everything" and "Delete everything" one-liners.
 */

let dataDir = ''
let statePath = ''
let saveTimer: NodeJS.Timeout | null = null
let pending: PersistedState | null = null

export function initStorePaths(): void {
  dataDir = join(app.getPath('userData'), 'data')
  statePath = join(dataDir, 'pawse.json')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
}

export function getDataDir(): string {
  return dataDir
}

export function getStatePath(): string {
  return statePath
}

export function loadState(): PersistedState {
  if (!existsSync(statePath)) return createInitialState()
  try {
    const raw = readFileSync(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as PersistedState
    return migrate(parsed)
  } catch (err) {
    // A corrupt file should never lose the user their cat silently. Keep a copy
    // next to the original and start fresh so the app still opens.
    console.error('[store] could not read state, starting fresh:', err)
    try {
      copyFileSync(statePath, `${statePath}.corrupt-${Date.now()}`)
    } catch {
      /* best effort */
    }
    return createInitialState()
  }
}

function migrate(state: PersistedState): PersistedState {
  const base = createInitialState()
  // Shallow-merge forward so a new field never lands as undefined in the UI.
  const merged: PersistedState = {
    ...base,
    ...state,
    version: STATE_VERSION,
    pet: { ...base.pet, ...state.pet },
    settings: {
      ...defaultSettings,
      ...state.settings,
      llm: { ...defaultSettings.llm, ...state.settings?.llm },
      notion: { ...defaultSettings.notion, ...state.settings?.notion }
    },
    // Added after the first release, so an existing file won't have it.
    siteTime: state.siteTime ?? {}
  }
  // Installs made before pairing existed have no token; without one the
  // extension can never authenticate, so mint it on the way through.
  if (!merged.settings.bridgeToken) merged.settings.bridgeToken = makeBridgeToken()

  // Bubbles and sessions are runtime-ish; a stale one from a previous run is
  // noise, and a half-finished session can't be resumed meaningfully.
  merged.bubbles = []
  merged.questDraft = null
  if (merged.session && merged.session.phase !== 'done') merged.session = null
  return merged
}

/** Queue a debounced write. Safe to call on every state change. */
export function saveState(state: PersistedState): void {
  pending = state
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    flushState()
  }, 800)
}

/** Write immediately — call before quit. */
export function flushState(): void {
  if (!pending || !statePath) return
  const state = pending
  pending = null
  try {
    const tmp = `${statePath}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8')
    renameSync(tmp, statePath)
  } catch (err) {
    console.error('[store] write failed:', err)
  }
}

export function deleteEverything(): PersistedState {
  const fresh = createInitialState()
  pending = fresh
  flushState()
  return fresh
}
