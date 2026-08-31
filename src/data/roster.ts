/**
 * Sample group roster.
 *
 * Deliberately small and obviously fictional: enough to see the board's shape
 * without anyone mistaking it for real data. Replaced by the group API once
 * there is a backend — see docs/DESIGN_HANDOFF.md for the intended schema.
 */

import type { Member } from '../lib/leaderboard';

export const SAMPLE_GROUP = {
  id: 'tuesday-crew',
  name: 'Tuesday Crew',
  initials: 'TC',
  homeAlley: 'Rose Bowl Lanes',
  isOpen: false,
  youOwnIt: true,
  unreadMessages: 7,
  gamesThisWeek: 11,
};

export const SAMPLE_ROSTER: Member[] = [
  { id: 'kenji', name: 'Kenji Mori', initials: 'KM', avg: 198, high: 268, pins: 3120, hdcp: 201, imp: 6, games: 14, since: 'Feb 2026' },
  { id: 'you', name: 'You', initials: 'YOU', avg: 191, high: 245, pins: 2740, hdcp: 199, imp: 18, games: 12, since: 'Jan 2026', isMe: true },
  { id: 'aya', name: 'Aya Sato', initials: 'AS', avg: 187, high: 234, pins: 3480, hdcp: 205, imp: 9, games: 16, since: 'Mar 2026' },
  { id: 'rika', name: 'Rika Tanabe', initials: 'RT', avg: 176, high: 212, pins: 1290, hdcp: 196, imp: 24, games: 6, since: 'Aug 2026' },
  { id: 'daniel', name: 'Daniel Okafor', initials: 'DO', avg: 173, high: 228, pins: 2610, hdcp: 194, imp: 3, games: 13, since: 'Feb 2026' },
  { id: 'mei', name: 'Mei Lin', initials: 'ML', avg: 168, high: 205, pins: 1640, hdcp: 192, imp: 15, games: 8, since: 'Jun 2026' },
];

export const SAMPLE_FEED = [
  { text: 'Aya Sato shared a 234 — group record', time: '20:12', tone: 'accent' as const },
  { text: 'Rika Tanabe joined with your invite code', time: '19:48', tone: 'neutral' as const },
  { text: 'You passed Daniel on the rolling average', time: '18:30', tone: 'down' as const },
];
