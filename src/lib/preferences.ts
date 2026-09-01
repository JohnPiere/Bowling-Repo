/**
 * Everything the bowler has chosen, kept together.
 *
 * `localStorage` rather than IndexedDB: these are a handful of small values
 * that several screens read while rendering, and waiting on an async open to
 * decide what language to draw in would flash the wrong one. Every read is
 * defensive — a private window or a browser set to block site data throws on
 * access, and a preference is never worth failing a screen over.
 */

import { useCallback, useEffect, useState } from 'react';

export type Language = 'en' | 'ja';

export interface Preferences {
  language: Language;
  /** Shown on the analytics profile card and beside shared games. */
  playerName: string;
  /** One of AVATARS, drawn on the profile tile. */
  playerIcon: string;
  /**
   * Push every finished game to the crew as it is saved.
   *
   * Off by default and deliberately so: sharing is the one thing here that
   * other people see, and a default that publishes without being asked is the
   * wrong way round.
   */
  autoShare: boolean;
  /** Which group auto-sharing posts to, when there is more than one. */
  autoShareGroupId: string | null;
}

export const AVATARS = ['◆', '●', '▲', '★', '◼', '✚'];

export const DEFAULTS: Preferences = {
  language: 'en',
  playerName: 'You',
  playerIcon: '◆',
  autoShare: false,
  autoShareGroupId: null,
};

const KEY = 'lane-log.preferences';

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    // Merged over the defaults, so a preference added in a later version does
    // not come back undefined for someone who stored the older shape.
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Out of quota, or storage blocked. The session keeps the choice either
    // way; it just will not survive a reload.
  }
}

/** Broadcast within the tab, so every screen sees a change immediately. */
const CHANGED = 'lane-log:preferences';

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  useEffect(() => {
    const sync = () => setPreferences(loadPreferences());
    window.addEventListener(CHANGED, sync);
    // `storage` fires in *other* tabs, which is what keeps two open copies of
    // the app from disagreeing about the language.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((changes: Partial<Preferences>) => {
    const next = { ...loadPreferences(), ...changes };
    savePreferences(next);
    setPreferences(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { preferences, update };
}
