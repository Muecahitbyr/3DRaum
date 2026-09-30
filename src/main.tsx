import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Fallback } from './components/layout/Fallback';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root-Element #root nicht gefunden');

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary
      fallback={() => (
        <Fallback
          testId="app-error"
          title="Es ist ein unerwarteter Fehler aufgetreten"
          message="Gespeicherte Projekte bleiben im Browser erhalten. Bitte laden Sie die Seite neu und öffnen Sie Ihr Projekt über „Projekte“."
          action={{ label: 'Seite neu laden', onClick: () => window.location.reload() }}
        />
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
