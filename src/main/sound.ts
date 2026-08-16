import type { SoundCue } from '@shared/types'
import { getState } from './appState'
import { broadcast } from './windows'

/**
 * Sound cues are fire-and-forget events, not state.
 *
 * Putting them in AppState would mean every one-second broadcast re-delivers
 * the last cue, and the app would tick at you forever. A separate channel
 * keeps "this just happened" distinct from "this is how things are".
 *
 * Muting is enforced here so a muted app doesn't even send the event.
 */
export function playSound(cue: SoundCue): void {
  const { settings } = getState()
  if (settings.muted || settings.volume <= 0) return
  broadcast('pawse:sound', { cue, volume: settings.volume })
}
