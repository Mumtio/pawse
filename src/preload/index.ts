import { contextBridge, ipcRenderer } from 'electron'
import type { ClientState, Intent, IntentResult, SoundCue } from '@shared/types'

/**
 * The whole renderer-facing surface. Intents go out, whole states come back.
 * Nothing here exposes Node or the filesystem to the page.
 */

const api = {
  /** Send an intent to main. Resolves once main has applied it. */
  send: (intent: Intent): Promise<IntentResult> => ipcRenderer.invoke('pawse:intent', intent),

  /** Pull the current state — used once on mount. */
  requestState: (): Promise<ClientState> => ipcRenderer.invoke('pawse:requestState'),

  /** Subscribe to state broadcasts. Returns an unsubscribe function. */
  onState: (cb: (state: ClientState) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: ClientState): void => cb(state)
    ipcRenderer.on('pawse:state', listener)
    return () => ipcRenderer.removeListener('pawse:state', listener)
  },

  /**
   * One-shot audio cues. Separate from state on purpose — a cue means "this
   * just happened", and replaying it on every state broadcast would chirp
   * once a second forever.
   */
  onSound: (cb: (payload: { cue: SoundCue; volume: number }) => void): (() => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: { cue: SoundCue; volume: number }
    ): void => cb(payload)
    ipcRenderer.on('pawse:sound', listener)
    return () => ipcRenderer.removeListener('pawse:sound', listener)
  },

  /** Cat window only: toggle whether the window accepts mouse events. */
  setCatInteractive: (interactive: boolean): void =>
    ipcRenderer.send('cat:setInteractive', interactive),

  /**
   * Cat window only: begin a drag. No coordinates — main works out the grab
   * offset from the OS cursor and the window position, which keeps everything
   * in one coordinate space.
   */
  startCatDrag: (): void => ipcRenderer.send('cat:dragStart'),

  /** Cat window only: end a drag. Resolves with how far the pointer travelled. */
  endCatDrag: (): Promise<{ moved: number }> => ipcRenderer.invoke('cat:dragEnd')
}

export type PawseApi = typeof api

contextBridge.exposeInMainWorld('pawse', api)
