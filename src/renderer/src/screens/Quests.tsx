import { useState } from 'react'
import type { ClientState, Quest } from '@shared/types'
import type { Route, Send } from '../App'
import type { Prefill } from './Today'
import { shortDate } from './Today'

type Tab = 'active' | 'upcoming' | 'finished'

export function Quests({
  state,
  send,
  onStartChapter
}: {
  state: ClientState
  send: Send
  onNavigate: (r: Route) => void
  onStartChapter: (p: Prefill) => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('active')
  const [openId, setOpenId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const open = state.quests.find((q) => q.id === openId) ?? null

  if (open) {
    return (
      <QuestDetail
        quest={open}
        send={send}
        onBack={() => setOpenId(null)}
        onStartChapter={onStartChapter}
      />
    )
  }

  const filtered = state.quests.filter((q) => {
    const done = q.chapters.every((c) => c.done)
    if (tab === 'finished') return done || q.archivedAt
    if (tab === 'upcoming') return !done && !q.archivedAt && q.chapters.every((c) => !c.done)
    return !done && !q.archivedAt
  })

  return (
    <>
      <header className="page-head">
        <h1>Quests</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}>
          Import
        </button>
        <button className="btn btn-primary" onClick={() => setImporting(true)}>
          + New quest
        </button>
      </header>

      <div className="row">
        <div className="seg">
          {(['active', 'upcoming', 'finished'] as Tab[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <h3>no quests here yet</h3>
          <p>paste an assignment and {state.pet.name} will break it into chapters.</p>
          <p style={{ marginTop: 'var(--s4)' }}>
            <button className="btn btn-primary" onClick={() => setImporting(true)}>
              Add one
            </button>
          </p>
        </div>
      ) : (
        <div className="tickets">
          {filtered.map((quest) => (
            <article
              className="ticket stamp"
              key={quest.id}
              onClick={() => setOpenId(quest.id)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <p className="ticket-title" style={{ textTransform: 'uppercase' }}>
                  {quest.title}
                </p>
                <p className="ticket-meta">
                  {quest.subtitle || quest.theme}
                  {quest.dueAt ? ` · due ${shortDate(quest.dueAt)}` : ''} · {quest.source}
                </p>
              </div>
              <div className="spacer" />
              <Progress quest={quest} />
            </article>
          ))}
        </div>
      )}

      {(importing || state.questDraft || state.runtime.llmBusy) && (
        <ImportDialog state={state} send={send} onClose={() => setImporting(false)} />
      )}
    </>
  )
}

function Progress({ quest }: { quest: Quest }): React.JSX.Element {
  const done = quest.chapters.filter((c) => c.done).length
  return (
    <div className="row" style={{ gap: 'var(--s3)' }}>
      <div className="progress-blocks">
        {quest.chapters.map((c) => (
          <span key={c.id} className={`progress-block${c.done ? ' is-on' : ''}`} />
        ))}
      </div>
      <span className="ticket-meta">
        {done}/{quest.chapters.length}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function QuestDetail({
  quest,
  send,
  onBack,
  onStartChapter
}: {
  quest: Quest
  send: Send
  onBack: () => void
  onStartChapter: (p: Prefill) => void
}): React.JSX.Element {
  const [view, setView] = useState<'story' | 'checklist'>('story')
  const nextChapter = quest.chapters.find((c) => !c.done)

  return (
    <>
      <header className="page-head">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ‹ Quests
        </button>
        <div className="spacer" />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            void send({ type: 'quest:archive', questId: quest.id })
            onBack()
          }}
        >
          Archive
        </button>
      </header>

      <div>
        <h1 style={{ textTransform: 'uppercase' }}>{quest.title}</h1>
        <p className="page-date">
          {quest.subtitle}
          {quest.dueAt ? ` · due ${shortDate(quest.dueAt)}` : ''} · {quest.theme}
        </p>
      </div>

      <div className="seg">
        <button aria-pressed={view === 'story'} onClick={() => setView('story')}>
          Story
        </button>
        <button aria-pressed={view === 'checklist'} onClick={() => setView('checklist')}>
          Checklist
        </button>
      </div>

      <section>
        {quest.chapters.map((chapter) => (
          <div className={`chapter${chapter.done ? ' is-done' : ''}`} key={chapter.id}>
            <button
              className="check"
              role="checkbox"
              aria-checked={chapter.done}
              aria-label={`mark ${chapter.title} done`}
              onClick={() =>
                void send({
                  type: 'quest:toggleChapter',
                  questId: quest.id,
                  chapterId: chapter.id
                })
              }
            />
            <div style={{ flex: 1 }}>
              <p className="chapter-title">
                {view === 'story' ? chapter.title : chapter.realTask}
              </p>
              <p className="chapter-real">
                {view === 'story' ? chapter.realTask : chapter.title}
              </p>
              <p className="chapter-meta">
                ~{chapter.estMinutes}m · reward: {chapter.reward}
              </p>
            </div>
            {chapter.id === nextChapter?.id && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  onStartChapter({
                    questId: quest.id,
                    chapterId: chapter.id,
                    title: chapter.title,
                    minutes: chapter.estMinutes
                  })
                }
              >
                Start
              </button>
            )}
          </div>
        ))}
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------

const THEMES = [
  'fantasy kingdom',
  'magical library',
  'space expedition',
  'detective mystery',
  'cozy village',
  'pirate voyage'
]

/**
 * Generated chapters are always shown for approval before anything is saved.
 * Pawse must never quietly rewrite someone's coursework requirements.
 */
function ImportDialog({
  state,
  send,
  onClose
}: {
  state: ClientState
  send: Send
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [theme, setTheme] = useState(THEMES[0])
  const draft = state.questDraft
  const busy = state.runtime.llmBusy

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog">
        {!draft ? (
          <>
            <h2>Turn work into a quest</h2>
            <p className="muted">
              paste your assignment, brief, or to-do list. {state.pet.name} regroups what's already
              there — nothing is invented, and you approve it before it's saved.
            </p>

            <textarea
              className="field"
              placeholder="Paste the assignment text here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />

            <div className="row">
              <span className="label">theme</span>
              <select
                className="field"
                style={{ width: 220 }}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                {THEMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="spacer" />
              <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !text.trim()}
                onClick={() => void send({ type: 'quest:generate', text, theme })}
              >
                {busy ? 'reading…' : 'Generate chapters'}
              </button>
            </div>

            {state.settings.llm.provider === 'none' && (
              <p className="notice">
                no model connected — chapters will be split locally. add a free key in Settings ›
                Connections for better ones.
              </p>
            )}
          </>
        ) : (
          <>
            <h2>Does this look right?</h2>
            {state.runtime.llmNotice && <p className="notice">{state.runtime.llmNotice}</p>}
            <p className="muted">
              {draft.title} — {draft.chapters.length} chapters
            </p>

            <section>
              {draft.chapters.map((c) => (
                <div className="chapter" key={c.id}>
                  <div style={{ flex: 1 }}>
                    <p className="chapter-title">{c.title}</p>
                    <p className="chapter-real">{c.realTask}</p>
                    <p className="chapter-meta">
                      ~{c.estMinutes}m · reward: {c.reward}
                    </p>
                  </div>
                </div>
              ))}
            </section>

            <div className="row">
              <div className="spacer" />
              <button
                className="btn btn-ghost"
                onClick={() => void send({ type: 'quest:discardDraft' })}
              >
                Discard
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void send({ type: 'quest:acceptDraft' })
                  onClose()
                }}
              >
                Save quest
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
