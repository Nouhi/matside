import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Catches render-time errors anywhere below it and shows a recoverable fallback
 * instead of a blank white screen. React Query / async errors are handled
 * separately via the QueryCache onError -> toast handler in main.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
    // Reported to Sentry when VITE_SENTRY_DSN is set; no-op otherwise.
    reportError(error, { componentStack: info.componentStack });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h1>
        <p className="text-gray-500 mb-6 max-w-md">
          The app hit an unexpected error. Reloading usually fixes it. If it keeps
          happening, let the organizer know.
        </p>
        {this.state.message && (
          <pre className="text-xs text-gray-400 mb-6 max-w-md overflow-x-auto">
            {this.state.message}
          </pre>
        )}
        <button
          onClick={this.handleReload}
          className="px-4 py-2 rounded bg-[#0a3a7a] text-white font-medium text-sm hover:bg-[#0c4690] transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
