import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Keeps one broken screen from blanking the whole window.
 *
 * Without this, a single bad read — a settings field the main process hasn't
 * back-filled yet, a shape that changed under a hot-reloaded renderer — unmounts
 * the entire tree and leaves an empty panel with no clue as to why. That is
 * indistinguishable from a feature simply not working, which is the worst
 * possible failure mode: it sends people looking for a bug in the wrong place.
 *
 * Resets on navigation via `resetKey`, so moving to another screen and back
 * clears the error rather than wedging until the app is restarted.
 */
interface Props {
  children: ReactNode
  /** Change this to clear a previous error — the current route works well. */
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[pawse] screen crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="empty">
        <h3>this screen hit a problem</h3>
        <p className="muted">
          Nothing has been lost — your data is on disk and the rest of the app still works. Switching
          to another screen and back will try again.
        </p>
        <p className="setting-hint" style={{ marginTop: 'var(--s4)' }}>
          {error.message}
        </p>
      </div>
    )
  }
}
