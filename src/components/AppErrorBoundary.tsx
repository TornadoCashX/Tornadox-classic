import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryState {
  hasError: boolean
}

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="section" role="alert">
        <div className="container has-text-centered">
          <h1 className="title">Tornado Cash</h1>
          <p className="mb-5">The application could not continue because of an unexpected error.</p>
          <button type="button" className="button is-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    )
  }
}

export default AppErrorBoundary
