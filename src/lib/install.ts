/**
 * Home Screen installation.
 *
 * Android/Chromium fires `beforeinstallprompt`, which we stash so the app can
 * offer installation at a sensible moment rather than whenever the browser
 * feels like it. iOS fires nothing and exposes no install API at all, so there
 * the only honest option is to show the Share-sheet instructions.
 */

import { isIos, isStandalone } from './platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'prompt-available' }
  | { kind: 'manual-ios' }
  | { kind: 'unavailable' };

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(state: InstallState) => void>();

function currentState(): InstallState {
  if (isStandalone()) return { kind: 'installed' };
  if (deferredPrompt) return { kind: 'prompt-available' };
  if (isIos()) return { kind: 'manual-ios' };
  return { kind: 'unavailable' };
}

function notify() {
  const state = currentState();
  listeners.forEach((listener) => listener(state));
}

/** Call once at startup, before React renders, so no early event is missed. */
export function watchInstallability(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppressing the default is what lets us choose when to ask.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function subscribeToInstallState(listener: (state: InstallState) => void): () => void {
  listeners.add(listener);
  listener(currentState());
  return () => listeners.delete(listener);
}

export function getInstallState(): InstallState {
  return currentState();
}

/** Show the browser's install prompt. Resolves to whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  // The event is single-use; the browser will fire a fresh one if it decides
  // the app is still installable.
  deferredPrompt = null;
  notify();
  return outcome === 'accepted';
}

export const IOS_INSTALL_STEPS = [
  'Open Lane Log in Safari (Chrome and Firefox on iOS cannot install web apps).',
  'Tap the Share button in the toolbar.',
  'Scroll down and tap "Add to Home Screen".',
  'Open Lane Log from the Home Screen — notifications only work from there.',
];
