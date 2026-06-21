import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in the page tree so a thrown component shows a recoverable
 * message instead of a blank white screen. Kept outside the providers in App so the
 * navbar/providers survive and the user can reload or navigate away.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto mt-16 rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted mb-4">
            This page hit an unexpected error. Reloading usually fixes it; if it persists,
            try "Start over" to reset your session.
          </p>
          <p className="text-xs text-bad mb-4 break-words">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm px-4 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
