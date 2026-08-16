import { useEffect, useMemo, useState } from 'react'
import type { ClientState, FocusMode } from '@shared/types'
import type { Send } from '../App'
import type { Prefill } from './Today'
import { formatClock } from '../lib/usePawse'
import { nextUp } from './Today'

const DURATIONS = [25, 45, 90]
const BREAKS = [5, 10, 15, 0]

const MODES: Array<{ id: FocusMode; blurb: string }> = [
  { id: 'gentle', blurb: 'cat asks before hiding anything' },
  { id: 'deep', blurb: 'feeds and recommendations hidden automatically' },
  { id: 'strict', blurb: 'distracting sites blocked until the break' }
]

export function FocusScreen({
  state,
  send,
  prefill,
  onConsumePrefill
}: {
  state: ClientState
  send: Send
  prefill: Prefill | null
  onConsumePrefill: () => void
}): React.JSX.Element {
  if (state.session) return <RunningSession state={state} send={send} />
  if (state.lastSummary) return <Summary state={state} send={send} />
  return <SetupSession state={state} send={send} prefill={prefill} onConsumePrefill={onConsumePrefill} />
}

// ---------------------------------------------------------------------------

function SetupSession({
  state,
  send,
  prefill,
  onConsumePrefill
}: {
  state: ClientState
  send: Send
  prefill: Prefill | null
  onConsumePrefill: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Prefill | null>(prefill)
  const [minutes, setMinutes] = useState(state.settings.defaultDuration)
  const [customMinutes, setCustomMinutes] = useState('60')
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [mode, setMode] = useState<FocusMode>(state.settings.defaultMode)
  const [checklist, setChecklist] = useState<string[]>([])
  const [draftItem, setDraftItem] = useState('')

  useEffect(() => {
    if (!prefill) return
    setSelected(prefill)
    setMinutes(nearestDuration(prefill.minutes))
    onConsumePrefill()
  }, [prefill, onConsumePrefill])

  const options = useMemo(() => {
    const rows = nextUp(state.quests, 12)
    if (!query.trim()) return rows
    const q = query.toLowerCase()
    return rows.filter(
      (r) => r.chapter.title.toLowerCase().includes(q) || r.quest.title.toLowerCase().includes(q)
    )
  }, [state.quests, query])

  const taskTitle = selected?.title ?? query.trim()
  const resolvedMinutes = minutes === -1 ? Number(customMinutes) || 60 : minutes

  const start = (): void => {
    void send({
      type: 'focus:start',
      taskTitle: taskTitle || 'Focus',
      minutes: resolvedMinutes,
      breakMinutes,
      mode,
      questId: selected?.questId,
      chapterId: selected?.chapterId,
      checklist
    })
  }

  return (
    <>
      <header className="page-head">
        <h1>What are we working on?</h1>
      </header>

      <section className="stack">
        <input
          className="field"
          placeholder="Search or type a new task…"
          value={selected ? selected.title : query}
          onChange={(e) => {
            setSelected(null)
            setQuery(e.target.value)
          }}
        />

        {options.length > 0 && (
          <div className="task-list">
            {options.map(({ quest, chapter }) => (
              <button
                key={chapter.id}
                className="task-row"
                aria-selected={selected?.chapterId === chapter.id}
                onClick={() =>
                  setSelected({
                    questId: quest.id,
                    chapterId: chapter.id,
                    title: chapter.title,
                    minutes: chapter.estMinutes
                  })
                }
              >
                <span aria-hidden="true">▸</span>
                {chapter.title}
                <span className="task-row-source">{quest.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="row" style={{ alignItems: 'flex-start', gap: 'var(--s10)' }}>
        <div className="stack">
          <p className="section-label">How long?</p>
          <div className="row">
            {DURATIONS.map((d) => (
              <button
                key={d}
                className="btn"
                aria-pressed={minutes === d}
                style={minutes === d ? selectedStyle : undefined}
                onClick={() => setMinutes(d)}
              >
                {d}
              </button>
            ))}
            <button
              className="btn"
              aria-pressed={minutes === -1}
              style={minutes === -1 ? selectedStyle : undefined}
              onClick={() => setMinutes(-1)}
            >
              Custom
            </button>
            <button
              className="btn"
              aria-pressed={minutes === 0}
              style={minutes === 0 ? selectedStyle : undefined}
              title="Open-ended — counts up until you stop it"
              onClick={() => setMinutes(0)}
            >
              ∞
            </button>
            {minutes === -1 && (
              <input
                className="field"
                style={{ width: 80 }}
                inputMode="numeric"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </div>
        </div>

        <div className="stack">
          <p className="section-label">Break</p>
          <div className="row">
            {BREAKS.map((b) => (
              <button
                key={b}
                className="btn"
                aria-pressed={breakMinutes === b}
                style={breakMinutes === b ? selectedStyle : undefined}
                onClick={() => setBreakMinutes(b)}
              >
                {b === 0 ? 'None' : b}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="stack">
        <p className="section-label">Mode</p>
        {MODES.map((m) => (
          <button
            key={m.id}
            className="mode-option"
            aria-pressed={mode === m.id}
            onClick={() => setMode(m.id)}
          >
            <span className="radio" />
            <span className="mode-name">{m.id}</span>
            <span className="muted">{m.blurb}</span>
          </button>
        ))}
      </section>

      <section className="stack">
        <div className="row">
          <p className="section-label">Checklist for this session</p>
          <div className="spacer" />
        </div>
        <div className="panel stack">
          {checklist.length === 0 && (
            <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
              optional. small steps you want to remember mid-session.
            </p>
          )}
          {checklist.map((item, i) => (
            <div className="row" key={`${item}-${i}`}>
              <span className="check" aria-checked="false" role="checkbox" />
              <span>{item}</span>
              <div className="spacer" />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
              >
                remove
              </button>
            </div>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!draftItem.trim()) return
              setChecklist([...checklist, draftItem.trim()])
              setDraftItem('')
            }}
          >
            <input
              className="field"
              placeholder="+ add item"
              value={draftItem}
              onChange={(e) => setDraftItem(e.target.value)}
            />
            <button className="btn btn-sm" type="submit">
              add
            </button>
          </form>
        </div>
      </section>

      <section className="stack">
        <p className="section-label">Gatekeeper</p>
        <div className="panel stack">
          {state.runtime.extensionConnected ? (
            <>
              <p style={{ color: 'var(--moss)' }}>
                Allowed: docs sites, your current tab, anything you approve
              </p>
              <p className="muted">Hidden: YouTube feed + Shorts, Reddit home, X timeline</p>
            </>
          ) : (
            <p className="muted">
              browser extension not connected — focus still works, feeds just won't be hidden.
              see Settings › Connections.
            </p>
          )}
        </div>
      </section>

      <div className="row">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={start}>
          Start Focus
        </button>
      </div>
    </>
  )
}

const selectedStyle: React.CSSProperties = {
  background: 'var(--cream)',
  color: 'var(--on-cream)'
}

function nearestDuration(minutes: number): number {
  return DURATIONS.reduce((best, d) =>
    Math.abs(d - minutes) < Math.abs(best - minutes) ? d : best
  )
}

// ---------------------------------------------------------------------------

function RunningSession({ state, send }: { state: ClientState; send: Send }): React.JSX.Element {
  const session = state.session!
  const openEnded = session.plannedMinutes <= 0 && session.phase === 'focus'

  return (
    <>
      <header className="page-head">
        <h1>{session.phase === 'break' ? 'Break' : 'Focus'}</h1>
      </header>

      <section className="session-panel">
        <p className="muted">{session.taskTitle}</p>
        <p className="session-clock">{formatClock(state.runtime.phaseRemainingSec)}</p>
        <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
          {openEnded
            ? 'counting up'
            : session.paused
              ? state.runtime.idleSeconds >= state.settings.idleThresholdMin * 60
                ? 'paused — you stepped away'
                : 'paused'
              : `${session.plannedMinutes} minute ${session.phase}`}
        </p>

        <div className="row">
          {session.paused ? (
            <button className="btn btn-primary" onClick={() => void send({ type: 'focus:resume' })}>
              Resume
            </button>
          ) : (
            <button className="btn" onClick={() => void send({ type: 'focus:pause' })}>
              Pause
            </button>
          )}
          {!openEnded && (
            <button className="btn btn-ghost" onClick={() => void send({ type: 'focus:skipPhase' })}>
              Skip {session.phase}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => void send({ type: 'focus:stop' })}>
            End session
          </button>
        </div>
      </section>

      {session.checklist.length > 0 && (
        <section className="stack">
          <p className="section-label">Checklist</p>
          <div className="panel stack">
            {session.checklist.map((item) => (
              <button
                key={item.id}
                className="row"
                style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                onClick={() => void send({ type: 'focus:toggleChecklist', itemId: item.id })}
              >
                <span className="check" role="checkbox" aria-checked={item.done} />
                <span
                  style={{
                    textDecoration: item.done ? 'line-through' : 'none',
                    color: item.done ? 'var(--text-faint)' : 'inherit'
                  }}
                >
                  {item.text}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
        you can close this window — {state.pet.name} keeps the timer.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------

function Summary({ state, send }: { state: ClientState; send: Send }): React.JSX.Element {
  const s = state.lastSummary!
  return (
    <>
      <header className="page-head">
        <h1>Session done</h1>
      </header>

      <section className="card-cream stack">
        <p>
          You worked for <strong>{s.activeMinutes} active minutes</strong>
          {s.checklistTotal > 0 && (
            <>
              , completed {s.checklistDone} of {s.checklistTotal} checklist item
              {s.checklistTotal === 1 ? '' : 's'}
            </>
          )}
          {s.returns > 0 && <> and came back {s.returns} time{s.returns === 1 ? '' : 's'}</>}.
        </p>
        {s.rewards.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {s.rewards.map((r, i) => (
              <li key={i}>{r.label}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="row">
        <button className="btn btn-primary" onClick={() => void send({ type: 'focus:dismissSummary' })}>
          Thanks
        </button>
      </div>
    </>
  )
}
