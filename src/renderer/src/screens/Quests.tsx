import { useState } from 'react'
import type { ClientState, NotionPage, Quest } from '@shared/types'
import { notionSettingsOf } from '@shared/defaults'
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
 * Pick a Notion page to import.
 *
 * Searching is explicit rather than on every keystroke: each one is a network
 * round-trip against someone's real workspace, and Notion rate-limits. An empty
 * query is valid and lists everything shared with the integration, which is the
 * common case — most people have connected two or three pages, not two hundred.
 */
function NotionPicker({
  state,
  send,
  theme
}: {
  state: ClientState
  send: Send
  theme: string
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<NotionPage[] | null>(null)
  const [error, setError] = useState('')
  const [importingId, setImportingId] = useState<string | null>(null)
  const busy = state.runtime.notionBusy || state.runtime.llmBusy
  const hasToken = notionSettingsOf(state.settings).token.trim().length > 0

  const search = async (): Promise<void> => {
    setError('')
    const res = await send({ type: 'notion:search', query })
    if (res.ok) setPages(((res.data as { pages?: NotionPage[] })?.pages ?? []))
    else {
      setPages(null)
      setError(res.error ?? 'could not reach Notion')
    }
  }

  /**
   * Importing has to report its own failures. Firing this off and ignoring the
   * result meant a page that couldn't be read did nothing at all when clicked —
   * the reason sat in a console the user has no way to open, and the button
   * looked simply broken.
   */
  const importPage = async (page: NotionPage): Promise<void> => {
    setError('')
    setImportingId(page.id)
    const res = await send({
      type: 'notion:import',
      pageId: page.id,
      object: page.object,
      theme
    })
    setImportingId(null)
    if (!res.ok) setError(res.error ?? 'could not read that page')
  }

  if (!hasToken) {
    return (
      <p className="notice">
        no Notion token yet — add one in Settings › Connections, then share the page you want with
        your integration.
      </p>
    )
  }

  return (
    <div className="stack">
      <div className="row">
        <input
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          placeholder="search your Notion pages, or leave blank for all"
          value={query}
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button className="btn btn-sm" onClick={() => void search()} disabled={busy}>
          {state.runtime.notionBusy ? 'looking…' : 'Search'}
        </button>
      </div>

      {error && <p className="notice">{error}</p>}

      {pages !== null && pages.length === 0 && !error && (
        /*
          Far more often "nothing has been shared with the integration yet"
          than "no matches", so it says the thing that actually unblocks them
          instead of a bare "no results".
        */
        <p className="notice">
          nothing came back. open the Notion page you want, then share it with your integration from
          the ⋯ menu — a new integration can't see anything until you do.
        </p>
      )}

      {pages && pages.length > 0 && (
        <div className="stack">
          {pages.map((page) => (
            <div className="row" key={page.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="chapter-title">{page.title}</p>
                <p className="chapter-meta">
                  {page.object}
                  {page.editedAt ? ` · edited ${shortDate(page.editedAt)}` : ''}
                </p>
              </div>
              <button
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void importPage(page)}
              >
                {importingId === page.id ? 'reading…' : 'Use this'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const [source, setSource] = useState<'paste' | 'notion'>('paste')
  const draft = state.questDraft
  const busy = state.runtime.llmBusy

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog">
        {!draft ? (
          <>
            <h2>Turn work into a quest</h2>
            <p className="muted">
              {state.pet.name} regroups what's already there — nothing is invented, and you approve
              it before it's saved.
            </p>

            <div className="seg">
              <button aria-pressed={source === 'paste'} onClick={() => setSource('paste')} disabled={busy}>
                Paste text
              </button>
              <button aria-pressed={source === 'notion'} onClick={() => setSource('notion')} disabled={busy}>
                From Notion
              </button>
            </div>

            {source === 'notion' ? (
              <NotionPicker state={state} send={send} theme={theme} />
            ) : (
              <textarea
                className="field"
                placeholder="Paste the assignment text here…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
              />
            )}

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
              {/* Notion generates from the page you pick, so it has no button here. */}
              {source === 'paste' && (
                <button
                  className="btn btn-primary"
                  disabled={busy || !text.trim()}
                  onClick={() => void send({ type: 'quest:generate', text, theme })}
                >
                  {busy ? 'reading…' : 'Generate chapters'}
                </button>
              )}
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
