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
   * A photograph for the tile, as a small square data URL, or null.
   *
   * It lives here rather than in IndexedDB so every avatar on every screen has
   * it while rendering — a tile that flashed initials for a frame on the way to
   * a picture is worse than one that never had a picture. `lib/avatar.ts` keeps
   * it to about ten kilobytes, which is what makes that affordable.
   *
   * Wins over `playerIcon` where both are set, because a picture is the more
   * specific answer to the same question.
   */
  playerPhoto: string | null;
  /** A key from PLAYER_COLOURS. Tints the avatar wherever it is drawn. */
  playerColour: string;
  /**
   * When the bowler finished setting themselves up, or null if they have not.
   *
   * A timestamp rather than a boolean because it answers a second question for
   * free — how long this install has been in use — and because `false` and
   * "stored by a version that had no such field" are indistinguishable, while
   * `null` and a number are not.
   */
  onboardedAt: number | null;
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
  /**
   * The screen the app opens on.
   *
   * The dashboard is the right default and the wrong answer for a lot of
   * people: somebody who opens this at the lane wants the rack, and somebody
   * who opens it on the train wants the board. Both of those are a tap away,
   * which is exactly the tap worth removing — it is paid every single time.
   */
  startScreen: StartScreen;
  /**
   * How a game starts.
   *
   * "Ask" is the default and stays the default, because the two modes record
   * different things and the choice is worth making. But it is the same choice
   * every game for anyone who has settled on one, and a question with a known
   * answer is a question not worth asking.
   */
  scoringEntry: 'ask' | 'rack' | 'pad';
  /**
   * The alley usually bowled at, pre-filled on the finishing step.
   *
   * The house is what turns a pile of scores into per-house averages, and it
   * is typed by hand on a phone at the end of a game — which is the moment
   * somebody is least inclined to type. Most people bowl most of their games
   * in one place; this fills that in and leaves it editable.
   */
  homeHouse: string;
}

/** Where the app can open. The tab bar, in the order it draws them. */
export type StartScreen = 'home' | 'play' | 'history' | 'stats' | 'groups';

export const START_SCREENS: { key: StartScreen; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'play', label: 'Play' },
  { key: 'history', label: 'History' },
  { key: 'stats', label: 'Stats' },
  { key: 'groups', label: 'Crew' },
];

/**
 * The avatar tile's mark. The empty string means "use my initials", which is
 * how the handoff draws it and so the default.
 */
export const AVATARS = ['', '◆', '●', '▲', '★', '◼', '✚', '☗', '✦', '⬢'];

/**
 * What the avatar is tinted.
 *
 * Six, not a colour wheel: these sit on a dark ground beside an accent the
 * whole app already uses, and the ones that work there are a narrow set. Each
 * is bright enough to read a dark glyph against, which is what the tile does.
 */
export const PLAYER_COLOURS: { key: string; hex: string; label: string }[] = [
  { key: 'accent', hex: '#9184d9', label: 'Violet' },
  { key: 'rose', hex: '#d97b93', label: 'Rose' },
  { key: 'amber', hex: '#d9a441', label: 'Amber' },
  { key: 'teal', hex: '#4fb3a5', label: 'Teal' },
  { key: 'sky', hex: '#6f9ad9', label: 'Sky' },
  { key: 'moss', hex: '#74c17a', label: 'Moss' },
];

/** The hex for a stored key, falling back to the app's own accent. */
export function colourOf(key: string): string {
  return (PLAYER_COLOURS.find((colour) => colour.key === key) ?? PLAYER_COLOURS[0]).hex;
}

export const DEFAULTS: Preferences = {
  language: 'en',
  playerName: 'You',
  playerIcon: '',
  playerPhoto: null,
  playerColour: 'accent',
  onboardedAt: null,
  autoShare: false,
  autoShareGroupId: null,
  startScreen: 'home',
  scoringEntry: 'ask',
  homeHouse: '',
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

/**
 * Write the lot, and say whether it stuck.
 *
 * The return value matters now that a photograph can be in here: everything
 * else on this object is a few dozen bytes and cannot plausibly fail on quota,
 * so failing quietly was the right trade. A picture can, and a picture that
 * silently did not save — taking the name and the language with it, since this
 * is one write — is worth telling somebody about.
 */
export function savePreferences(preferences: Preferences): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    return true;
  } catch {
    // Out of quota, or storage blocked. The session keeps the choice either
    // way; it just will not survive a reload.
    return false;
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
    const stored = savePreferences(next);
    // Applied to the screen either way: a change that cannot be written is
    // still the change the bowler asked for, and reverting it under them would
    // look like the tap missed.
    setPreferences(next);
    window.dispatchEvent(new Event(CHANGED));
    return stored;
  }, []);

  return { preferences, update };
}
