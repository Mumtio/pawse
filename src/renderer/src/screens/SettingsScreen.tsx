import { useState } from 'react'
import type { ClientState, LlmProvider } from '@shared/types'
import { normaliseSite } from '@shared/defaults'
import type { Send } from '../App'

type Tab = 'general' | 'cat' | 'focus' | 'connections' | 'privacy' | 'about'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'cat', label: 'Cat' },
  { id: 'focus', label: 'Focus & Gatekeeper' },
  { id: 'connections', label: 'Connections' },
  { id: 'privacy', label: 'Privacy & data' },
  { id: 'about', label: 'About' }
]

export function SettingsScreen({
  state,
  send
}: {
  state: ClientState
  send: Send
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('general')
  const s = state.settings

  const set = (p: Partial<ClientState['settings']>): void => {
    void send({ type: 'settings:patch', patch: p })
  }

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <div className="settings">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'general' && (
            <>
              <Row label="Launch at login">
                <Toggle on={s.launchAtLogin} onChange={(v) => set({ launchAtLogin: v })} />
              </Row>
              <Row label="Start minimised">
                <Toggle on={s.startMinimised} onChange={(v) => set({ startMinimised: v })} />
              </Row>
              <Row label="Theme">
                <div className="seg">
                  {(['night', 'day', 'system'] as const).map((t) => (
                    <button key={t} aria-pressed={s.theme === t} onClick={() => set({ theme: t })}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Sound" hint="short chiptune cues for reminders, feeding and finishing">
                <Toggle on={!s.muted} onChange={(v) => set({ muted: !v })} />
              </Row>
              <Row label="Volume">
                <input
                  type="range"
                  min={0}
                  max={100}
                  disabled={s.muted}
                  value={Math.round(s.volume * 100)}
                  onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
                />
              </Row>
            </>
          )}

          {tab === 'cat' && (
            <>
              <Row label="Name">
                <input
                  className="field"
                  style={{ width: 200 }}
                  defaultValue={state.pet.name}
                  maxLength={20}
                  onBlur={(e) => void send({ type: 'pet:rename', name: e.target.value })}
                />
              </Row>
              <Row label="Size">
                <div className="seg">
                  {(['S', 'M', 'L'] as const).map((size) => (
                    <button
                      key={size}
                      aria-pressed={s.catSize === size}
                      onClick={() => set({ catSize: size })}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </Row>
              <Row
                label="Talkativeness"
                hint="how often the cat checks in or offers a word of its own accord. all the way down means never."
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(s.talkativeness * 100)}
                  onChange={(e) => set({ talkativeness: Number(e.target.value) / 100 })}
                />
              </Row>
              <Row label="Show on all workspaces">
                <Toggle
                  on={s.showOnAllWorkspaces}
                  onChange={(v) => set({ showOnAllWorkspaces: v })}
                />
              </Row>
              <Row label="Hide during full-screen apps">
                <Toggle
                  on={s.hideDuringFullscreen}
                  onChange={(v) => set({ hideDuringFullscreen: v })}
                />
              </Row>
              <Row label="Show the cat">
                <Toggle
                  on={state.runtime.catVisible}
                  onChange={(v) => void send({ type: 'cat:setVisible', visible: v })}
                />
              </Row>
            </>
          )}

          {tab === 'focus' && (
            <>
              <Row label="Default duration">
                <div className="seg">
                  {[25, 45, 90].map((d) => (
                    <button
                      key={d}
                      aria-pressed={s.defaultDuration === d}
                      onClick={() => set({ defaultDuration: d })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Default mode">
                <div className="seg">
                  {(['gentle', 'deep', 'strict'] as const).map((m) => (
                    <button
                      key={m}
                      aria-pressed={s.defaultMode === m}
                      onClick={() => set({ defaultMode: m })}
                    >
                      {m[0].toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Auto-start breaks">
                <Toggle on={s.autoStartBreaks} onChange={(v) => set({ autoStartBreaks: v })} />
              </Row>
              <Row
                label="Idle threshold"
                hint="stepping away for longer pauses the session instead of burning it"
              >
                <div className="row">
                  <input
                    className="field"
                    style={{ width: 64 }}
                    inputMode="numeric"
                    value={s.idleThresholdMin}
                    onChange={(e) =>
                      set({ idleThresholdMin: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <span className="muted">min</span>
                </div>
              </Row>
              <Row label="Show session HUD" hint="the little timer above the cat">
                <Toggle on={s.showHud} onChange={(v) => set({ showHud: v })} />
              </Row>
              <Row
                label="Doomscroll sensitivity"
                hint="Watchful checks in after about 4 minutes of continuous scrolling."
              >
                <div className="seg">
                  {(['relaxed', 'normal', 'watchful'] as const).map((d) => (
                    <button
                      key={d}
                      aria-pressed={s.doomscrollSensitivity === d}
                      onClick={() => set({ doomscrollSensitivity: d })}
                    >
                      {d[0].toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </Row>

              <p className="section-label" style={{ marginTop: 'var(--s8)' }}>
                Your sites
              </p>
              <p className="muted" style={{ margin: 'var(--s2) 0 var(--s4)', fontSize: 'var(--t-xs)' }}>
                The Gatekeeper hides feeds on blocked sites during a session, and time there counts
                as distracted. Study sites are always left alone. Needs the browser extension.
              </p>

              <SiteList
                title="Blocked while focusing"
                hint="Subdomains are included, so youtube.com covers m.youtube.com too."
                placeholder="e.g. youtube.com"
                sites={s.blockedSites}
                onChange={(blockedSites) => set({ blockedSites })}
                emptyNote="Nothing blocked. The Gatekeeper has nothing to hide."
              />

              <SiteList
                title="Study sites"
                hint="Always allowed, and never counted as a distraction — even if the same site is blocked above."
                placeholder="e.g. notion.so"
                sites={s.studySites}
                onChange={(studySites) => set({ studySites })}
                emptyNote="None yet. Add the places you actually work."
              />
            </>
          )}

          {tab === 'connections' && <Connections state={state} send={send} set={set} />}

          {tab === 'privacy' && (
            <>
              <div className="panel" style={{ marginBottom: 'var(--s5)' }}>
                <Row label="Pause all tracking" hint="nothing is recorded while this is on">
                  <Toggle on={s.trackingPaused} onChange={(v) => set({ trackingPaused: v })} />
                </Row>
              </div>

              <Row label="Track domains only, never page content">
                <span className="locked">🔒 always on</span>
              </Row>
              <Row label="Exclude incognito">
                <span className="locked">🔒 always on</span>
              </Row>
              <Row label="Keystrokes are counted, never recorded">
                <span className="locked">🔒 always on</span>
              </Row>

              <div className="row" style={{ marginTop: 'var(--s6)', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => void send({ type: 'data:openFolder' })}>
                  Open my data folder
                </button>
                <button className="btn" onClick={() => void send({ type: 'data:export' })}>
                  Export everything
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => void send({ type: 'data:deleteHistory' })}
                >
                  Delete history…
                </button>
              </div>
              <div className="row" style={{ marginTop: 'var(--s4)' }}>
                <button
                  className="btn btn-danger"
                  onClick={() => void send({ type: 'data:deleteEverything' })}
                >
                  Delete everything…
                </button>
              </div>
            </>
          )}

          {tab === 'about' && (
            <div className="stack">
              <h2>Pawse</h2>
              <p className="muted">version 0.1.0</p>
              <p>
                A calm, no-shame study companion. Made for people who work better with a little
                company.
              </p>
              <p className="muted" style={{ fontSize: 'var(--t-xs)', lineHeight: 1.7 }}>
                Pawse does not diagnose anything, does not recommend medication or dosage, and
                never marks a dose taken on your behalf. Insights describe your own activity and
                nothing more.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * An editable list of domains.
 *
 * Entries are normalised on the way in, so pasting a whole URL works and lands
 * on the same row as typing the bare host. Removal is a single click with no
 * confirmation — the lists are cheap to rebuild, and a dialog for every removed
 * row would be worse than the mistake it prevents.
 */
function SiteList({
  title,
  hint,
  placeholder,
  sites,
  onChange,
  emptyNote
}: {
  title: string
  hint: string
  placeholder: string
  sites: string[]
  onChange: (sites: string[]) => void
  emptyNote: string
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const add = (): void => {
    const site = normaliseSite(draft)
    if (!site) {
      // The most common miss by far is a bare word with no dot.
      setError(draft.trim() ? 'that does not look like a website address' : '')
      return
    }
    if (sites.some((s) => s === site)) {
      setError(`${site} is already on this list`)
      setDraft('')
      return
    }
    onChange([...sites, site])
    setDraft('')
    setError('')
  }

  const remove = (site: string): void => {
    onChange(sites.filter((s) => s !== site))
    setError('')
  }

  return (
    <div className="panel stack" style={{ marginBottom: 'var(--s5)' }}>
      <div className="setting-label">
        <span>{title}</span>
        <p className="setting-hint">{hint}</p>
      </div>

      <div className="row">
        <input
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          placeholder={placeholder}
          value={draft}
          aria-label={`Add a site to ${title}`}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="btn btn-sm" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>

      {error && (
        <p className="setting-hint" role="alert" style={{ color: 'var(--clay)' }}>
          {error}
        </p>
      )}

      {sites.length === 0 ? (
        <p className="setting-hint">{emptyNote}</p>
      ) : (
        <ul className="site-list">
          {sites.map((site) => (
            <li key={site}>
              <span>{site}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => remove(site)}
                aria-label={`Remove ${site}`}
                title={`Remove ${site}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

const PROVIDERS: Array<{ id: LlmProvider; label: string; hint: string; model: string }> = [
  { id: 'none', label: 'None (offline)', hint: 'chapters are split locally', model: '' },
  {
    id: 'gemini',
    label: 'Google AI Studio',
    hint: 'free tier, no card needed — aistudio.google.com/apikey',
    model: 'gemini-2.0-flash'
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    hint: 'Groq, OpenRouter, Together, LM Studio — anything with /chat/completions',
    model: 'llama-3.3-70b-versatile'
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    hint: 'fully offline, no key — needs Ollama running on this machine',
    model: 'llama3.1'
  }
]

function Connections({
  state,
  send,
  set
}: {
  state: ClientState
  send: Send
  set: (p: Partial<ClientState['settings']>) => void
}): React.JSX.Element {
  const llm = state.settings.llm
  const provider = PROVIDERS.find((p) => p.id === llm.provider) ?? PROVIDERS[0]
  void send

  return (
    <>
      <p className="section-label">Quest generation</p>
      <p className="muted" style={{ margin: 'var(--s2) 0 var(--s4)', fontSize: 'var(--t-xs)' }}>
        Optional. Pawse works without this — chapters just get split locally instead. Your key is
        stored on this computer and only ever sent to the provider you pick.
      </p>

      <Row label="Provider">
        <select
          className="field"
          style={{ width: 240 }}
          value={llm.provider}
          onChange={(e) => {
            const next = PROVIDERS.find((p) => p.id === (e.target.value as LlmProvider))!
            set({ llm: { ...llm, provider: next.id, model: next.model } })
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>

      {llm.provider !== 'none' && (
        <>
          <p className="setting-hint" style={{ marginBottom: 'var(--s4)' }}>
            {provider.hint}
          </p>

          {llm.provider !== 'ollama' && (
            <Row label="API key">
              <input
                className="field"
                style={{ width: 280 }}
                type="password"
                placeholder="paste your key"
                value={llm.apiKey}
                onChange={(e) => set({ llm: { ...llm, apiKey: e.target.value } })}
              />
            </Row>
          )}

          <Row label="Model">
            <input
              className="field"
              style={{ width: 280 }}
              value={llm.model}
              onChange={(e) => set({ llm: { ...llm, model: e.target.value } })}
            />
          </Row>

          {(llm.provider === 'openai-compatible' || llm.provider === 'ollama') && (
            <Row label="Base URL">
              <input
                className="field"
                style={{ width: 280 }}
                placeholder={
                  llm.provider === 'ollama'
                    ? 'http://127.0.0.1:11434'
                    : 'https://api.groq.com/openai/v1'
                }
                value={llm.baseUrl}
                onChange={(e) => set({ llm: { ...llm, baseUrl: e.target.value } })}
              />
            </Row>
          )}
        </>
      )}

      <p className="section-label" style={{ marginTop: 'var(--s8)' }}>
        Browser extension
      </p>
      <div className="panel stack" style={{ marginTop: 'var(--s3)' }}>
        <div className="row">
          <span
            style={{
              color: state.runtime.extensionConnected ? 'var(--moss)' : 'var(--text-dim)'
            }}
          >
            {state.runtime.extensionConnected ? 'Paired' : 'Not connected'}
          </span>
          <span
            className="pairing-code"
            title="Enter this in the Pawse extension to pair it"
          >
            {state.settings.bridgeToken}
          </span>
          <div className="spacer" />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void send({ type: 'bridge:regenerateToken' })}
            title="Generates a new code and disconnects the current browser"
          >
            Re-pair
          </button>
        </div>

        {!state.runtime.extensionConnected && (
          <p className="setting-hint">
            Load <code>extension/</code> at <code>chrome://extensions</code> (Developer mode ›
            Load unpacked), open it, and enter the code above. The Gatekeeper and time-per-site
            need it; everything else works without.
          </p>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-label">
        <span>{label}</span>
        {hint && <p className="setting-hint">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  on,
  onChange
}: {
  on: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
}
