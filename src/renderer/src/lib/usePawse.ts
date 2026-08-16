import { useCallback, useEffect, useState } from 'react'
import type { ClientState, Intent } from '@shared/types'

/**
 * Subscribes to main's state broadcasts. Renderers are read-only views: they
 * render whatever arrives and describe user actions back as intents.
 */
export function usePawse(): {
  state: ClientState | null
  send: (intent: Intent) => Promise<void>
} {
  const [state, setState] = useState<ClientState | null>(null)

  useEffect(() => {
    let alive = true
    window.pawse.requestState().then((s) => {
      if (alive) setState(s)
    })
    const off = window.pawse.onState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])

  const send = useCallback(async (intent: Intent) => {
    const result = await window.pawse.send(intent)
    if (!result.ok && result.error && result.error !== 'cancelled') {
      console.error('[pawse] intent rejected:', intent.type, result.error)
    }
  }, [])

  return { state, send }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

export function formatDayLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long'
  })
}

export function greeting(at: number): string {
  const h = new Date(at).getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
