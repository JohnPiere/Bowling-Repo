import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { watchInstallability } from './lib/install';
import { updateArrived, watchForUpdates } from './lib/updates';

import './styles/nocturne.css';
import './styles/app.css';

// Registered before render so no early `beforeinstallprompt` is missed.
watchInstallability();

const updateSW = registerSW({
  // A bowler mid-game must not have the page swapped under them — rolls are
  // component state until the game is saved. Everything else is in IndexedDB,
  // so `updates.ts` takes the new version straight away unless a game is in
  // progress, and holds it behind a banner when one is. It used to be a
  // `confirm()`, which is dismissed with a stray tap, never comes back, and on
  // a Home Screen PWA may not appear at all: the new worker sat waiting while
  // the old one kept serving the old app.
  onNeedRefresh() {
    updateArrived(() => void updateSW(true));
  },
  // The browser checks for a new worker on navigation and about once a day,
  // which for an app opened from the Home Screen can mean never.
  onRegisteredSW(_url, registration) {
    if (registration) watchForUpdates(registration);
  },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Tells the boot guard in index.html that the bundle arrived and ran. Without
// it the guard would eventually paint its "could not start" screen over a
// perfectly good app.
(window as unknown as { __laneLogReady: boolean }).__laneLogReady = true;
