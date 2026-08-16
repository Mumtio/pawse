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
              needs the browser extension — nothing is recorded without it, and only domains ever
              are.
            </p>
          ) : (
            insights.topDomains.map((d) => (
              <div className="row" key={d.domain}>
                <span>{d.domain}</span>
                <div className="spacer" />
                <span className="muted">{d.minutes}m</span>
              </div>
            ))
          )}
        </div>

        <div className="stack" style={{ flex: 1 }}>
          <p className="section-label">Care</p>
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

      <p className="faint" style={{ fontSize: 'var(--t-xs)' }}>
        Returns after distraction: {insights.returns} · these are patterns, not conclusions about
        your health.
      </p>
    </>
  )
}

function label(hour: number): string {
  if (hour === 0) return '12a'
  if (hour < 12) return `${hour}a`
  if (hour === 12) return '12p'
  return `${hour - 12}p`
}
