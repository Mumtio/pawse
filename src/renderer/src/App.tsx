import { useCallback, useEffect, useState } from 'react'
import type { ClientState, Intent, IntentResult } from '@shared/types'
import { usePawse } from './lib/usePawse'
import { Glyph } from './components/Glyph'
import { PixelSprite } from './cat/PixelSprite'
import { MOOD_SPRITES } from './cat/sprites'
import { Today, type Prefill } from './screens/Today'
import { FocusScreen } from './screens/FocusScreen'
import { Quests } from './screens/Quests'
import { Reminders } from './screens/Reminders'
import { Insights } from './screens/Insights'
import { SettingsScreen } from './screens/SettingsScreen'
import { Onboarding } from './screens/Onboarding'

export type Route = 'today' | 'focus' | 'quests' | 'reminders' | 'insights' | 'settings'

const NAV: Array<{ id: Route; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'focus', label: 'Focus' },
  { id: 'quests', label: 'Quests' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'insights', label: 'Insights' }
]

export function App(): React.JSX.Element {
  const { state, send } = usePawse()
  const [route, setRoute] = useState<Route>('today')
  // Set when you hit Start on a chapter, so the focus setup opens pre-filled.
  const [prefill, setPrefill] = useState<Prefill | null>(null)

  const startChapter = useCallback((p: Prefill) => {
    setPrefill(p)
    setRoute('focus')
  }, [])

  // Follow the theme the user picked, including "match the system".
  useEffect(() => {
    if (!state) return
    const theme =
      state.settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'day'
          : 'night'
        : state.settings.theme
    document.documentElement.dataset.theme = theme
  }, [state?.settings.theme])

  if (!state) {
    return (
      <div className="app-loading">
        <p className="muted">waking up…</p>
      </div>
    )
  }

  if (!state.onboarded) {
    return <Onboarding send={send} />
  }

  return (
    <div className="app">
      <Sidebar state={state} route={route} onNavigate={setRoute} onSend={send} />
      <main className="content">
        <div className="content-inner">
          {route === 'today' && (
            <Today
              state={state}
              send={send}
              onNavigate={setRoute}
              onStartChapter={startChapter}
            />
          )}
          {route === 'focus' && (
            <FocusScreen
              state={state}
              send={send}
              prefill={prefill}
              onConsumePrefill={() => setPrefill(null)}
            />
          )}
          {route === 'quests' && (
            <Quests
              state={state}
              send={send}
              onNavigate={setRoute}
              onStartChapter={startChapter}
            />
          )}
          {route === 'reminders' && <Reminders state={state} send={send} />}
          {route === 'insights' && <Insights state={state} send={send} />}
          {route === 'settings' && <SettingsScreen state={state} send={send} />}
        </div>
      </main>
    </div>
  )
}

function Sidebar({
  state,
  route,
  onNavigate,
  onSend
}: {
  state: ClientState
  route: Route
  onNavigate: (r: Route) => void
  onSend: Send
}): React.JSX.Element {
  const { pet, session, runtime } = state
  const resting = pet.mood === 'sleeping' || pet.mood === 'drowsy'
  const timer = session ? formatShortClock(runtime.phaseRemainingSec) : null

  return (
    <aside className="sidebar">
      <div className="sidebar-cat">
        <div className="sidebar-portrait">
          <PixelSprite mood={pet.mood} scale={5} />
        </div>
        <span className="sidebar-name">{pet.name}</span>
        <span className="sidebar-status">
          <span className={`status-dot${resting ? ' is-resting' : ''}`} />
          {timer ?? MOOD_SPRITES[pet.mood]?.caption ?? 'idle'}
        </span>
      </div>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className="nav-item"
            aria-current={route === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Glyph name={item.id} size={2} />
            {item.label}
            {item.id === 'focus' && timer && <span className="nav-badge">{timer}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="currencies">
          <span className="currency currency-treats" title="treats">
            <Glyph name="treat" size={2} /> {state.treats}
          </span>
          <span className="currency currency-stars" title="stars">
            <Glyph name="star" size={2} /> {state.stars}
          </span>
          <div className="spacer" />
          <button
            className="mute-btn"
            aria-pressed={state.settings.muted}
            aria-label={state.settings.muted ? 'unmute sounds' : 'mute sounds'}
            title={state.settings.muted ? 'Sound off' : 'Sound on'}
            onClick={() =>
              void onSend({ type: 'settings:patch', patch: { muted: !state.settings.muted } })
            }
          >
            <Glyph name={state.settings.muted ? 'muted' : 'sound'} size={2} />
          </button>
        </div>
        <button
          className="nav-item"
          aria-current={route === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <Glyph name="settings" size={2} />
          Settings
        </button>
      </div>
    </aside>
  )
}

function formatShortClock(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60)
  const s = Math.max(0, sec) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export type Send = (intent: Intent) => Promise<IntentResult>
