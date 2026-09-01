import { beforeEach, describe, expect, it } from 'vitest';
import { format, JA, translate } from '../src/lib/i18n';
// The raw source, because a duplicate key is gone by the time the object is.
import i18nSource from '../src/lib/i18n?raw';
import { DEFAULTS, loadPreferences, savePreferences } from '../src/lib/preferences';

describe('translate', () => {
  it('returns the English untouched', () => {
    expect(translate('Save this game', 'en')).toBe('Save this game');
  });

  it('falls back to English rather than showing nothing', () => {
    // The whole point of keying by source text: a missing entry is a usable
    // screen, not a blank or a key name.
    expect(translate('A string nobody has translated yet', 'ja')).toBe(
      'A string nobody has translated yet',
    );
  });

  it('uses the house vocabulary where the handoff gave one', () => {
    expect(translate('Average', 'ja')).toBe('アベレージ');
    expect(translate('Spare conversion', 'ja')).toBe('スペア成功率');
  });
});

describe('format', () => {
  it('fills placeholders after translating', () => {
    expect(format('{n} games', { n: 3 })).toBe('3 games');
  });

  it('leaves a placeholder it has no value for, rather than blanking it', () => {
    expect(format('{n} of {total}', { n: 1 })).toBe('1 of {total}');
  });

  it('puts the pieces where the target language wants them', () => {
    // The reason placeholders exist rather than concatenation: Japanese does
    // not order the fragments the way English does.
    expect(format(translate('{n} games', 'ja'), { n: 3 })).toBe('3ゲーム');
  });
});

describe('the dictionary', () => {
  it('never maps a string to itself', () => {
    const same = Object.entries(JA).filter(([en, ja]) => en === ja);
    expect(same).toEqual([]);
  });

  it('has no empty translations', () => {
    const blank = Object.entries(JA)
      .filter(([, ja]) => !ja.trim())
      .map(([en]) => en);
    expect(blank).toEqual([]);
  });

  it('never lists the same English twice', () => {
    // Has to read the source: a duplicate key is silently collapsed by the
    // time the object exists, and the *last* one wins. That is how "Strikes"
    // came to mean both a count and a percentage, with whichever entry
    // happened to be lower in the file deciding for both screens.
    const table = i18nSource.slice(i18nSource.indexOf('export const JA'));
    const body = table.slice(0, table.indexOf('\n};'));

    const seen = new Set<string>();
    const twice: string[] = [];
    for (const [, key] of body.matchAll(/^ {2}'((?:[^'\\]|\\.)*)':/gm)) {
      if (seen.has(key)) twice.push(key);
      seen.add(key);
    }

    expect(twice).toEqual([]);
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
