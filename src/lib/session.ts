/**
 * Who is using the app.
 *
 * Guest is the default and a real state, not a degraded one: the handoff's
 * rule is that nothing asks for sign-in until the bowler touches shared
 * content. Signing in later is meant to be an upgrade of the same identity
 * rather than a migration, which is why the guest id is kept and reused.
 */

import { useCallback, useEffect, useState } from 'react';

export type Provider = 'google' | 'apple';

export interface Session {
  /** Stable across a sign-in, so local games stay attached to the same user. */
  id: string;
  isGuest: boolean;
  provider?: Provider;
  name: string;
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

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    // A private window or blocked storage: fall through to a fresh guest.
  }

  const guest = newGuest();
  saveSession(guest);
  return guest;
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Nothing to do — the session simply will not survive a reload.
  }
}

export function useSession() {
  const [session, setSession] = useState<Session>(() => loadSession());

  useEffect(() => saveSession(session), [session]);

  /**
   * Upgrade the guest in place.
   *
   * There is no OAuth wired up yet, so this records the provider locally and
   * keeps the same id — which is exactly the shape the real flow should have
   * when Google and Apple sign-in are added.
   */
  const signIn = useCallback((provider: Provider) => {
    setSession((current) => ({ ...current, isGuest: false, provider, name: 'You' }));
  }, []);

  const signOut = useCallback(() => {
    setSession((current) => ({ ...current, isGuest: true, provider: undefined }));
  }, []);

  return { session, signIn, signOut };
}
