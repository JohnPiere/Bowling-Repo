import { beforeEach, describe, expect, it } from 'vitest';
import {
  countUnread,
  daysUntil,
  handicap,
  initialsOf,
  markRead,
  standingFor,
  toGroup,
  toMessage,
  toSharedGame,
  type GroupRow,
  type MembershipRow,
  type MessageRow,
  type ProfileRow,
  type SharedGameRow,
} from '../src/lib/social';
import { providerUnavailable } from '../src/lib/backend';

const profile = (id: string, name: string): ProfileRow => ({ id, name, initials: '' });

const membership = (profileId: string, role: MembershipRow['role'] = 'member'): MembershipRow => ({
  group_id: 'g1',
  profile_id: profileId,
  role,
  joined_at: '2026-01-04T00:00:00Z',
  profiles: profile(profileId, profileId),
});

const shared = (profileId: string, total: number, playedAt: string): SharedGameRow => ({
  id: `s-${profileId}-${playedAt}-${total}`,
  group_id: 'g1',
  profile_id: profileId,
  local_id: `l-${playedAt}-${total}`,
  rolls: [],
  total,
  house: null,
  note: null,
  played_at: playedAt,
  created_at: playedAt,
});

const NOW = Date.UTC(2026, 7, 20);

describe('initialsOf', () => {
  it('takes the first and last word of a full name', () => {
    expect(initialsOf('Kenji Mori')).toBe('KM');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
  });

  it('takes two letters of a single Latin name', () => {
    expect(initialsOf('Madonna')).toBe('MA');
  });

  it('takes one character of a name written without spaces', () => {
    // Two characters of a Japanese given name reads as half a word, not as a
    // monogram.
    expect(initialsOf('ジョン')).toBe('ジ');
    expect(initialsOf('森')).toBe('森');
  });

  it('has something to draw for a blank name', () => {
    expect(initialsOf('   ')).toBe('—');
  });
});

describe('handicap', () => {
  it('adds 90% of the gap to the 220 basis', () => {
    // A 150 bowler carries 63 of the 70 they are short.
    expect(handicap(150)).toBe(213);
    expect(handicap(200)).toBe(218);
  });

  it('never goes below a bowler at or over the basis', () => {
    expect(handicap(220)).toBe(220);
    expect(handicap(240)).toBe(240);
  });

  it('brings a weaker bowler within reach of a stronger one', () => {
    // The whole point: two bowlers 50 pins apart end up 5 apart.
    expect(handicap(200) - handicap(150)).toBe(5);
  });
});

describe('standingFor', () => {
  it('averages the ten most recent games', () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => shared('me', 100, `2026-01-${10 + i}T19:00:00Z`)),
      ...Array.from({ length: 10 }, (_, i) => shared('me', 200, `2026-02-${10 + i}T19:00:00Z`)),
    ];
    expect(standingFor(profile('me', 'Me'), membership('me'), games, true, NOW).avg).toBe(200);
  });

  it('measures improvement against the first ten, not the crew', () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => shared('me', 150, `2026-01-${10 + i}T19:00:00Z`)),
      ...Array.from({ length: 10 }, (_, i) => shared('me', 180, `2026-02-${10 + i}T19:00:00Z`)),
    ];
    expect(standingFor(profile('me', 'Me'), membership('me'), games, true, NOW).imp).toBe(30);
  });

  it('reports no movement until there are two windows to compare', () => {
    // Nineteen games is one full window and a partial one, and the partial one
    // overlaps — which would read as improvement nobody made.
    const games = Array.from({ length: 19 }, (_, i) =>
      shared('me', 150 + i, `2026-01-${String(i + 1).padStart(2, '0')}T19:00:00Z`),
    );
    expect(standingFor(profile('me', 'Me'), membership('me'), games, true, NOW).imp).toBe(0);
  });

  it('counts pins for the current month only', () => {
    const games = [
      shared('me', 200, '2026-07-14T19:00:00Z'),
      shared('me', 180, '2026-08-02T19:00:00Z'),
      shared('me', 190, '2026-08-14T19:00:00Z'),
    ];
    const standing = standingFor(profile('me', 'Me'), membership('me'), games, true, NOW);
    expect(standing.pins).toBe(370);
    // …but the high game is lifetime.
    expect(standing.high).toBe(200);
  });

  it('has a usable row for somebody who has shared nothing', () => {
    // A new member is on the board from the day they join, at zero, rather than
    // missing from it.
    const standing = standingFor(profile('new', 'New Bowler'), membership('new'), [], false, NOW);
    expect(standing.games).toBe(0);
    expect(standing.avg).toBe(0);
    expect(standing.high).toBe(0);
    expect(standing.since).toMatch(/2026/);
  });

  it('dates a bowler from their first shared game, not their joining', () => {
    const games = [shared('me', 200, '2026-03-14T19:00:00Z')];
    expect(standingFor(profile('me', 'Me'), membership('me'), games, true, NOW).since).toMatch(
      /Mar/,
    );
  });
});

describe('toGroup', () => {
  const row: GroupRow = {
    id: 'g1',
    name: 'Tuesday Crew',
    home_alley: 'Round One Kawasaki',
    invite_code: 'TCRW31',
    code_expires_at: new Date(NOW + 5 * 86_400_000).toISOString(),
    created_by: 'me',
    created_at: '2026-01-04T00:00:00Z',
  };

  it('gives every member a line on the board', () => {
    const group = toGroup(
      row,
      [membership('me', 'owner'), membership('kenji')],
      [shared('me', 200, '2026-08-14T19:00:00Z')],
      'me',
      0,
      '',
      NOW,
    );
    expect(group.members).toHaveLength(2);
    expect(group.members.find((m) => m.id === 'me')?.isMe).toBe(true);
    expect(group.members.find((m) => m.id === 'kenji')?.isMe).toBeUndefined();
  });

  it('reports your own role, not the group creator’s', () => {
    expect(toGroup(row, [membership('me', 'owner')], [], 'me', 0, '', NOW).yourRole).toBe('owner');
    expect(toGroup(row, [membership('me', 'member')], [], 'me', 0, '', NOW).yourRole).toBe(
      'member',
    );
  });

  it('attributes each shared game to the bowler who posted it', () => {
    const group = toGroup(
      row,
      [membership('me'), membership('aya')],
      [shared('me', 150, '2026-08-14T19:00:00Z'), shared('aya', 250, '2026-08-15T19:00:00Z')],
      'me',
      0,
      '',
      NOW,
    );
    expect(group.members.find((m) => m.id === 'me')?.high).toBe(150);
    expect(group.members.find((m) => m.id === 'aya')?.high).toBe(250);
  });

  it('counts down to the invite code expiring', () => {
    expect(toGroup(row, [membership('me')], [], 'me', 0, '', NOW).codeExpiresInDays).toBe(5);
  });

  it('skips a membership whose profile did not come back', () => {
    // RLS returns rows you may read; a profile you may not see arrives null
    // rather than throwing, and a board row with no name is worse than none.
    const orphan: MembershipRow = { ...membership('ghost'), profiles: null };
    expect(toGroup(row, [membership('me'), orphan], [], 'me', 0, '', NOW).members).toHaveLength(1);
  });
});

describe('daysUntil', () => {
  it('rounds up, so a code good for another hour still reads as a day', () => {
    expect(daysUntil(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe(1);
  });

  it('is zero once the code has expired', () => {
    expect(daysUntil(new Date(NOW - 1000).toISOString(), NOW)).toBe(0);
  });

  it('is zero for a code with no expiry recorded', () => {
    expect(daysUntil(null, NOW)).toBe(0);
  });
});

describe('toMessage', () => {
  const authors = new Map([['kenji', profile('kenji', 'Kenji Mori')]]);
  const row: MessageRow = {
    id: 'm1',
    group_id: 'g1',
    author_id: 'kenji',
    body: 'Lane 6 is drying out.',
    shared_game_id: null,
    created_at: '2026-08-14T19:04:00Z',
  };

  it('names the author', () => {
    expect(toMessage(row, authors, 'me').author).toBe('Kenji Mori');
    expect(toMessage(row, authors, 'me').initials).toBe('KM');
  });

  it('calls your own messages yours', () => {
    expect(toMessage({ ...row, author_id: 'me' }, authors, 'me').author).toBe('You');
  });

  it('still renders a message from somebody who has since left', () => {
    // Their profile is gone from the roster query; the message is not, and a
    // thread with a hole in it is worse than one with an unnamed line.
    const gone = toMessage({ ...row, author_id: 'departed' }, authors, 'me');
    expect(gone.author).toBe('Someone');
    expect(gone.body).toBe('Lane 6 is drying out.');
  });
});

describe('toSharedGame', () => {
  const authors = new Map([['aya', profile('aya', 'Aya Sato')]]);

  it('reads the shape of the game off its rolls', () => {
    const row: SharedGameRow = {
      ...shared('aya', 300, '2026-08-14T19:00:00Z'),
      rolls: new Array(12).fill(10),
    };
    const post = toSharedGame(row, authors, 'me');
    expect(post.strikes).toBe(10);
    expect(post.spares).toBe(0);
    expect(post.score).toBe(300);
  });

  it('marks your own posts as retractable', () => {
    const mine = toSharedGame(shared('me', 200, '2026-08-14T19:00:00Z'), authors, 'me');
    expect(mine.isYours).toBe(true);
    expect(
      toSharedGame(shared('aya', 200, '2026-08-14T19:00:00Z'), authors, 'me').isYours,
    ).toBeUndefined();
  });
});

describe('countUnread', () => {
  beforeEach(() => {
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
  });

  const said = (author: string, at: string): MessageRow => ({
    id: at,
    group_id: 'g1',
    author_id: author,
    body: 'hi',
    shared_game_id: null,
    created_at: at,
  });

  it('counts everything before the chat has ever been opened', () => {
    expect(countUnread([said('kenji', '2026-08-14T19:00:00Z')], 'g1', 'me')).toBe(1);
  });

  it('never counts your own messages', () => {
    expect(countUnread([said('me', '2026-08-14T19:00:00Z')], 'g1', 'me')).toBe(0);
  });

  it('counts only what arrived after this device last looked', () => {
    markRead('g1', Date.UTC(2026, 7, 14, 19, 30));
    const rows = [said('kenji', '2026-08-14T19:00:00Z'), said('kenji', '2026-08-14T20:00:00Z')];
    expect(countUnread(rows, 'g1', 'me')).toBe(1);
  });

  it('keeps a read marker per crew', () => {
    markRead('g1', Date.UTC(2026, 7, 14, 19, 30));
    expect(countUnread([said('kenji', '2026-08-14T19:00:00Z')], 'other', 'me')).toBe(1);
  });
});

describe('providerUnavailable', () => {
  it('lets a switched-on provider through', () => {
    expect(providerUnavailable('google', { google: true, apple: false })).toBeNull();
  });

  it('names the dashboard switch for Google', () => {
    const why = providerUnavailable('google', { google: false, apple: false });
    expect(why).toMatch(/not switched on/i);
    expect(why).toMatch(/Supabase dashboard/i);
  });

  it('says why Apple is different', () => {
    // A bill rather than a switch, so "turn it on" would be wrong advice.
    expect(providerUnavailable('apple', { google: true, apple: false })).toMatch(
      /paid Apple developer account/i,
    );
  });

  it('does not refuse when the question could not be asked', () => {
    // An unreachable server must not become a locked door: the redirect itself
    // will report the real problem, and blocking here would turn one flaky
    // request into "you cannot sign in".
    expect(providerUnavailable('google', null)).toBeNull();
  });
});
