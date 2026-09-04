import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_LIFE_MS, loadDraft, saveDraft } from '../src/lib/draft';

const NOW = Date.parse('2026-09-04T20:00:00Z');

/** A tiny localStorage, since the unit tests run without a DOM. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as unknown as Storage;
}

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = fakeStorage();
});

const draft = {
  rolls: [10, 9, 1],
  pinfalls: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9], [10]],
  entry: 'rack' as const,
  startedAt: NOW - 60_000,
};

describe('a game in progress', () => {
  it('comes back exactly as it was left', () => {
    saveDraft(draft);
    expect(loadDraft(NOW)).toEqual(draft);
  });

  it('is nothing when no ball has been thrown', () => {
    saveDraft({ ...draft, rolls: [], pinfalls: [] });
    expect(loadDraft(NOW)).toBeNull();
  });

  it('is gone once cleared', () => {
    saveDraft(draft);
    clearDraft();
    expect(loadDraft(NOW)).toBeNull();
  });
});

describe('what is refused rather than resumed', () => {
  it('a game older than its life', () => {
    saveDraft({ ...draft, startedAt: NOW - DRAFT_LIFE_MS - 1 });
    expect(loadDraft(NOW)).toBeNull();
    // And one just inside it is still offered.
    saveDraft({ ...draft, startedAt: NOW - DRAFT_LIFE_MS + 1000 });
    expect(loadDraft(NOW)).not.toBeNull();
  });

  it('pin data that does not line up with the rolls', () => {
    // Every later ball would read against the wrong frame — the one failure
    // nothing downstream can tell from a leave that happened.
    saveDraft({ ...draft, pinfalls: [[1, 2, 3]] });
    expect(loadDraft(NOW)).toBeNull();
  });

  it('but no pin data at all is fine — that is the number pad', () => {
    saveDraft({ ...draft, pinfalls: [] });
    expect(loadDraft(NOW)?.pinfalls).toEqual([]);
  });

  it('a roll that is not a legal count', () => {
    saveDraft({ ...draft, rolls: [10, 11], pinfalls: [] });
    expect(loadDraft(NOW)).toBeNull();
    saveDraft({ ...draft, rolls: [-1], pinfalls: [] });
    expect(loadDraft(NOW)).toBeNull();
  });

  it('anything that is not a draft at all', () => {
    localStorage.setItem('lane-log.draft', 'not json');
    expect(loadDraft(NOW)).toBeNull();
    localStorage.setItem('lane-log.draft', '{"rolls":"nope"}');
    expect(loadDraft(NOW)).toBeNull();
  });
});
