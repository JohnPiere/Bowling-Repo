/**
 * Who is using the app.
 *
 * Guest is the default and a real state, not a degraded one: the handoff's rule
 * is that nothing asks for sign-in until the bowler touches shared content.
 * Everything that makes this a scoring app — the rack, the sheet scanner,
 * history, analytics — runs for a guest with no network at all.
 *
 * Signing in is therefore an *addition*, not a migration. The guest id is kept
 * alongside the account so that anything already attached to it still resolves,
 * and signing out returns the same guest rather than inventing a new one.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import {
  backend,
  describeBackendFailure,
  enabledProviders,
  hasStoredSession,
  isBackendConfigured,
  providerUnavailable,
  redirectUrl,
} from './backend';

export type Provider = 'google' | 'apple';

export interface Session {
  /** The account id when signed in, the device's guest id otherwise. */
  id: string;
  isGuest: boolean;
  provider?: Provider;
  name: string;
  email?: string;
  createdAt: number;
}

const KEY = 'lane-log.session';

function newGuest(): Session {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `u_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return { id, isGuest: true, name: 'You', createdAt: Date.now() };
}

/** The guest this device has always been, made once and kept. */
export function loadGuest(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Session;
      // Only the guest half is stored here. A signed-in session belongs to
      // Supabase's own storage, which knows how to refresh it.
      if (stored.isGuest) return stored;
    }
  } catch {
    // A private window or blocked storage: fall through to a fresh guest.
  }

  const guest = newGuest();
  saveGuest(guest);
  return guest;
}

export function saveGuest(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Nothing to do — the guest id simply will not survive a reload.
  }
}

/** What a Supabase session says about the person holding it. */
export function toSession(auth: AuthSession): Session {
  const meta = auth.user.user_metadata ?? {};
  const provider = auth.user.app_metadata?.provider;

  return {
    id: auth.user.id,
    isGuest: false,
    provider: provider === 'apple' ? 'apple' : provider === 'google' ? 'google' : undefined,
    name:
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      auth.user.email?.split('@')[0] ||
      'Bowler',
    email: auth.user.email ?? undefined,
    createdAt: Date.parse(auth.user.created_at ?? '') || Date.now(),
  };
}

export type SignInState = 'idle' | 'redirecting' | 'failed';

export function useSession() {
  const [session, setSession] = useState<Session>(() => loadGuest());
  /**
   * Whether the account is still being worked out.
   *
   * Restoring a session reads storage and may refresh a token over the network,
   * so there is a moment where "guest" is a guess rather than an answer. Screens
   * that gate on sign-in wait for this rather than flashing the sign-in card at
   * somebody who is already signed in.
   */
  // Only a device that has signed in before has anything to restore, and
  // asking costs nothing — so a guest never downloads the auth SDK to be told
  // they are a guest.
  const [restoring, setRestoring] = useState(() => isBackendConfigured() && hasStoredSession());
  const [signInState, setSignInState] = useState<SignInState>('idle');
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    // A redirect back from the provider carries `?code=`, and that has to be
    // exchanged even on a device with nothing stored yet — it is the one case
    // where a guest does need the SDK.
    const returning = new URLSearchParams(window.location.search).has('code');

    if (!isBackendConfigured() || (!hasStoredSession() && !returning)) {
      setRestoring(false);
      return;
    }

    let live = true;
    let unsubscribe: (() => void) | undefined;

    void backend()
      .then(async (db) => {
        const { data } = await db.auth.getSession();
        if (!live) return;
        if (data.session) setSession(toSession(data.session));

        // Fires for the OAuth redirect landing, a token refresh, and sign-out.
        const { data: sub } = db.auth.onAuthStateChange((_event, next) => {
          if (!live) return;
          setSession(next ? toSession(next) : loadGuest());
          setSignInState('idle');
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      })
      .catch(() => {
        // Unreachable server, or a paused project. A guest session is the right
        // answer either way: the app still scores games.
      })
      .finally(() => {
        if (live) setRestoring(false);
      });

    return () => {
      live = false;
      unsubscribe?.();
    };
  }, []);

  /**
   * Hand off to the provider.
   *
   * There is no success path here: this navigates away, and the bowler comes
   * back to a fresh page load that `onAuthStateChange` picks up. The only
   * outcome worth handling is failing to leave at all.
   *
   * The provider check has to happen *before* the redirect, because
   * `signInWithOAuth` does not ask the server anything — it builds a URL and
   * sets `location.href`, so a provider that is switched off is not an error
   * this code ever sees. Without the check the bowler lands on a bare JSON
   * error page on another origin, which is what happens rather than what the
   * screen says.
   */
  const signIn = useCallback(async (provider: Provider) => {
    if (!isBackendConfigured()) {
      setSignInState('failed');
      setSignInError('This build has no server configured, so there is nothing to sign in to.');
      return;
    }

    setSignInState('redirecting');
    setSignInError(null);

    const unavailable = providerUnavailable(provider, await enabledProviders());
    if (unavailable) {
      setSignInState('failed');
      setSignInError(unavailable);
      return;
    }

    const db = await backend();
    const { error } = await db.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl() },
    });

    if (error) {
      setSignInState('failed');
      setSignInError(describeBackendFailure(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    // Local first, so the screen changes even if the request never lands.
    setSession(loadGuest());
    if (isBackendConfigured() && hasStoredSession()) {
      await backend()
        .then((db) => db.auth.signOut())
        .catch(() => undefined);
    }
  }, []);

  const dismissSignInError = useCallback(() => {
    setSignInState('idle');
    setSignInError(null);
  }, []);

  return { session, restoring, signIn, signOut, signInState, signInError, dismissSignInError };
}
