import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { watchInstallability } from './lib/install';

import './styles/nocturne.css';
import './styles/app.css';

// Registered before render so no early `beforeinstallprompt` is missed.
watchInstallability();

const updateSW = registerSW({
  onNeedRefresh() {
    // A bowler mid-game should not have the page swapped under them, so the
    // update waits for an explicit yes.
    if (confirm('A new version of Lane Log is ready. Reload now?')) {
      void updateSW(true);
    }
  },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
