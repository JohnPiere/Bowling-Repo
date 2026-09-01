import { beforeEach, describe, expect, it } from 'vitest';
import { STRINGS, translate } from '../src/lib/i18n';
import { DEFAULTS, loadPreferences, savePreferences } from '../src/lib/preferences';

describe('translate', () => {
  it('returns the language asked for', () => {
    expect(translate('home', 'en')).toBe('Home');
    expect(translate('home', 'ja')).toBe('ホーム');
  });

  it('uses the house vocabulary, not a literal rendering', () => {
    // A Japanese bowler says アベレージ, not 平均.
    expect(translate('average', 'ja')).toBe('アベレージ');
    expect(translate('spareConversion', 'ja')).toBe('スペア成功率');
  });
});

describe('the string table', () => {
  it('has both languages for every key', () => {
    for (const [key, pair] of Object.entries(STRINGS)) {
      expect(pair[0], `${key} English`).toBeTruthy();
      expect(pair[1], `${key} Japanese`).toBeTruthy();
    }
  });

  it('actually translates — no key is the same in both', () => {
    // Catches a pair left half-filled by copy-paste. Numerals and names would
    // legitimately match, and there are none in this table.
    // Widened deliberately: with `as const` the literal types never overlap,
    // so TypeScript calls the comparison unreachable — which is only true of
    // the table as it stands today, not of the one someone edits tomorrow.
    const untranslated = (Object.entries(STRINGS) as [string, readonly [string, string]][])
      .filter(([, pair]) => pair[0] === pair[1])
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });
});

/**
 * The suite runs in node, where there is no DOM. A map with the four methods
 * `preferences.ts` touches is enough, and far cheaper than moving the whole
 * suite to jsdom for one module.
 */
function stubLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe('preferences', () => {
  beforeEach(stubLocalStorage);

  it('falls back to the defaults when nothing is stored', () => {
    localStorage.clear();
    expect(loadPreferences()).toEqual(DEFAULTS);
  });

  it('merges a stored older shape over the current defaults', () => {
    // Someone who stored preferences before autoShare existed must not get
    // `undefined` back for it.
    localStorage.setItem('lane-log.preferences', JSON.stringify({ language: 'ja' }));
    const loaded = loadPreferences();
    expect(loaded.language).toBe('ja');
    expect(loaded.autoShare).toBe(false);
  });

  it('survives unreadable storage rather than failing the screen', () => {
    localStorage.setItem('lane-log.preferences', 'not json');
    expect(loadPreferences()).toEqual(DEFAULTS);
  });

  it('round-trips a saved choice', () => {
    savePreferences({ ...DEFAULTS, language: 'ja', playerName: 'ジョン' });
    expect(loadPreferences().playerName).toBe('ジョン');
    localStorage.clear();
  });
});
