import { Component } from 'react'

/**
 * Local error boundary so a broken child can't blank the rest of the page.
 *   <ErrorBoundary>
 *     <RiskyThing />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info)
  }
  reset = () => this.setState({ error: null })
  render() {
    if (this.state.error) {
      return this.props.fallback ? (
        this.props.fallback({ error: this.state.error, reset: this.reset })
      ) : (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          <div className="font-semibold mb-1">Something failed to render.</div>
          <div className="font-mono text-[11px] mb-2 break-all">{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={this.reset} className="underline text-red-800">Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}
