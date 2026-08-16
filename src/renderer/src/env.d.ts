/// <reference types="vite/client" />

import type { ClientState, Intent, IntentResult, SoundCue } from '@shared/types'

declare global {
  interface Window {
    pawse: {
      send: (intent: Intent) => Promise<IntentResult>
      requestState: () => Promise<ClientState>
      onState: (cb: (state: ClientState) => void) => () => void
      onSound: (cb: (payload: { cue: SoundCue; volume: number }) => void) => () => void
      setCatInteractive: (interactive: boolean) => void
      startCatDrag: () => void
      endCatDrag: () => Promise<{ moved: number }>
    }
  }
}

export {}
