import type { Chapter, ClientState, Quest } from '@shared/types'
import type { Route, Send } from '../App'
import { PixelSprite } from '../cat/PixelSprite'
import { formatDayLabel, greeting } from '../lib/usePawse'
import { DayStrip } from '../components/DayStrip'
import { CatCare } from '../components/CatCare'

export interface Prefill {
  questId: string
  chapterId: string
  title: string
  minutes: number
}

export function Today({
  state,
  send,
  onNavigate,
  onStartChapter
}: {
  state: ClientState
  send: Send
  onNavigate: (r: Route) => void
  onStartChapter: (p: Prefill) => void
}): React.JSX.Element {
  const { pet, insights, runtime } = state
  const upcoming = nextUp(state.quests, 2)

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{greeting(runtime.now)}</h1>
        </div>
        <div className="spacer" />
        <span className="page-date">{formatDayLabel(runtime.now)}</span>
      </header>

      <section className="status-card">
        <div className="status-card-portrait">
          <PixelSprite mood={pet.mood} scale={4} />
        </div>
        <div>
          <h2>
            {pet.name} is {moodPhrase(pet.mood)}
          </h2>
          <p className="status-card-meta">
            {insights.todayFocusMinutes} active minutes today · {insights.chaptersToday} chapter
            {insights.chaptersToday === 1 ? '' : 's'} done
          </p>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => onNavigate('focus')}>
          {state.session ? 'Back to session' : 'Start focus'}
        </button>
      </section>

      <section>
        <p className="section-label">{pet.name}</p>
        <CatCare state={state} send={send} />
      </section>

      <section>
        <p className="section-label">Next up</p>
        {upcoming.length === 0 ? (
          <div className="empty">
            <h3>nothing queued</h3>
            <p>
              add a quest and its chapters show up here.{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('quests')}>
                open quests
              </button>
            </p>
          </div>
        ) : (
          <div className="tickets">
            {upcoming.map(({ quest, chapter }) => (
              <article className="ticket stamp" key={chapter.id}>
                <div>
                  <p className="ticket-title">{chapter.title}</p>
                  <p className="ticket-meta">
                    {quest.title}
                    {quest.dueAt ? ` · due ${shortDate(quest.dueAt)}` : ''} · est.{' '}
                    {chapter.estMinutes} min
                  </p>
                </div>
                <div className="spacer" />
                <button
                  className="btn btn-cream"
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
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="section-label">Your day</p>
        <DayStrip slots={insights.dayStrip} />
      </section>
    </>
  )
}

function moodPhrase(mood: string): string {
  switch (mood) {
    case 'studying':
      return 'studying'
    case 'break':
      return 'taking a break'
    case 'sleeping':
      return 'asleep'
    case 'drowsy':
      return 'getting sleepy'
    case 'eating':
      return 'eating'
    case 'celebrating':
      return 'pleased with you'
    default:
      return 'keeping you company'
  }
}

export function nextUp(
  quests: Quest[],
  limit: number
): Array<{ quest: Quest; chapter: Chapter }> {
  const rows: Array<{ quest: Quest; chapter: Chapter }> = []
  for (const quest of quests) {
    if (quest.archivedAt) continue
    const chapter = quest.chapters.find((c) => !c.done)
    if (chapter) rows.push({ quest, chapter })
  }
  rows.sort((a, b) => (a.quest.dueAt ?? Infinity) - (b.quest.dueAt ?? Infinity))
  return rows.slice(0, limit)
}

export function shortDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { weekday: 'short' })
}
