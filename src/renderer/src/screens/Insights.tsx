import type { ClientState } from '@shared/types'
import type { Send } from '../App'

/**
 * Observations, not a report card.
 *
 * Everything here is computed on this machine from the local activity log.
 * The language stays descriptive — "your longest stretches were between 8 and
 * 10pm" — because the moment this screen starts grading people it stops being
 * useful to the ones who need it most.
 */
export function Insights({ state, send }: { state: ClientState; send: Send }): React.JSX.Element {
  const { insights } = state
  const peak = Math.max(1, ...insights.hourHistogram)

  return (
    <>
      <header className="page-head">
        <h1>Insights</h1>
        <div className="spacer" />
        <span className="page-date">last 7 days</span>
      </header>

      <section className="stack">
        <p className="section-label">When you focused</p>
        <div className="histogram">
          {insights.hourHistogram.map((minutes, hour) => (
            <div
              key={hour}
              className="histogram-bar"
              style={{ height: `${Math.max(4, (minutes / peak) * 100)}%` }}
              title={`${label(hour)} — ${minutes} min`}
            />
          ))}
        </div>
        <div className="histogram-axis">
          {[0, 4, 8, 12, 16, 20].map((h) => (
            <span key={h}>{label(h)}</span>
          ))}
        </div>
      </section>

      <section className="stack">
        {insights.observations.map((line) => (
          <div className="card-cream" key={line}>
            “{line}”
          </div>
        ))}

        {insights.suggestion && (
          <div className="card-cream stack">
            <p>“{insights.suggestion.text}”</p>
            <div className="row">
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  void send({
                    type: 'settings:patch',
                    patch: { defaultDuration: insights.suggestion!.defaultMinutes }
                  })
                }
              >
                Make {insights.suggestion.defaultMinutes} my default
              </button>
              <button className="btn btn-sm">Not really</button>
            </div>
          </div>
        )}
      </section>

      <section className="row" style={{ alignItems: 'flex-start', gap: 'var(--s10)' }}>
        <div className="stack" style={{ flex: 1 }}>
          <p className="section-label">Where the time went</p>
          {insights.topDomains.length === 0 ? (
            <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
              {state.runtime.extensionConnected
                ? 'the extension is connected — this fills in as you browse. only sites on your two lists are ever recorded.'
                : 'needs the browser extension — nothing is recorded without it, and only domains ever are.'}
            </p>
          ) : (
            <>
              {insights.distractedMinutesWeek > 0 && (
                <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
                  {duration(insights.distractedMinutesWeek)} of this was on blocked sites.
                </p>
              )}
              {insights.topDomains.map((d) => (
                <div className="row" key={d.domain}>
                  {/*
                    The dot is the only mark of judgement on this screen, and it
                    reports a setting rather than an opinion: it means "this is
                    on your blocked list", not "this was time badly spent".
                  */}
                  <span
                    className="site-dot"
                    data-blocked={d.blocked}
                    aria-hidden="true"
                  />
                  <span>{d.domain}</span>
                  <div className="spacer" />
                  <span className="muted">{duration(d.minutes)}</span>
                </div>
              ))}
              <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
                ● blocked while focusing · ○ everything else
              </p>
            </>
          )}
        </div>

        <div className="stack" style={{ flex: 1 }}>
          <p className="section-label">Care</p>
          <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
            days in the last 7 you confirmed each reminder at least once.
          </p>
          {insights.care.map((c) => (
            <div className="row" key={c.kind}>
              <span>{c.label}</span>
              <div className="spacer" />
              <span className="muted">
                {c.done} of {c.of} days
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function label(hour: number): string {
  if (hour === 0) return '12a'
  if (hour < 12) return `${hour}a`
  if (hour === 12) return '12p'
  return `${hour - 12}p`
}
