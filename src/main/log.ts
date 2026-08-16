import type { AppState, LogEntry } from '@shared/types'

/**
 * A local, append-only activity log. It records what happened and when —
 * never page content, never keystrokes. Insights are computed from this and
 * nothing leaves the machine.
 */

const MAX_ENTRIES = 5000

export function pushLog(state: AppState, entry: LogEntry): void {
  if (state.settings.trackingPaused) return
  state.log.push(entry)
  if (state.log.length > MAX_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_ENTRIES)
  }
}

export function startOfLocalDay(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function entriesSince(state: AppState, since: number): LogEntry[] {
  return state.log.filter((e) => e.at >= since)
}
