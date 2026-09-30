import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  /** Ersatzinhalt bei einem Fehler; `reset` versucht es erneut. */
  fallback: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Fängt Darstellungsfehler ab, damit die Anwendung nie einfach weiß wird. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Bewusst im Log behalten: hilft bei der Fehlersuche, stört Nutzer nicht.
    console.error('Darstellungsfehler abgefangen:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) return this.props.fallback(error, () => this.setState({ error: null }));
    return this.props.children;
  }
}
