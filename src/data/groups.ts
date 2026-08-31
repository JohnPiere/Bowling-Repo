/**
 * Sample social data.
 *
 * Stands in for the group API described in docs/DESIGN_HANDOFF.md. Small and
 * plainly fictional, so nobody mistakes it for real activity. Replacing this
 * file is the whole job when a backend exists.
 */

import type { Member } from '../lib/leaderboard';
import { SAMPLE_ROSTER } from './roster';

export interface Group {
  id: string;
  name: string;
  initials: string;
  homeAlley?: string;
  /** Invite-only is the only mode that ships; open doors are "Soon". */
  isOpen: boolean;
  doorsOpen: boolean;
  inviteCode: string;
  codeExpiresInDays: number;
  yourRole: 'owner' | 'moderator' | 'member';
  members: Member[];
  unread: number;
  lastMessage: string;
  lastActivity: string;
  /** A warm tile sets this group apart in the list. */
  warmTile?: boolean;
}

export const GROUPS: Group[] = [
  {
    id: 'tuesday-crew',
    name: 'Tuesday Crew',
    initials: 'TC',
    homeAlley: 'Round One Kawasaki',
    isOpen: false,
    doorsOpen: true,
    inviteCode: 'TCRW31',
    codeExpiresInDays: 11,
    yourRole: 'owner',
    members: SAMPLE_ROSTER,
    unread: 3,
    lastMessage: 'Aya: lane 6 is drying out fast tonight',
    lastActivity: 'you created it',
    warmTile: true,
  },
  {
    id: 'round-one-regulars',
    name: 'Round One Regulars',
    initials: 'RO',
    homeAlley: 'Round One Kawasaki',
    isOpen: false,
    doorsOpen: true,
    inviteCode: 'RONE47',
    codeExpiresInDays: 6,
    yourRole: 'member',
    members: SAMPLE_ROSTER.slice(0, 4),
    unread: 0,
    lastMessage: 'Kenji: new Phaze surface came in',
    lastActivity: 'quiet',
  },
];

export function findGroup(id: string): Group | undefined {
  return GROUPS.find((group) => group.id === id);
}

export interface ChatMessage {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  time: string;
  body: string;
  /** A game shared to the board; the chat carries a link to it. */
  sharedScore?: { score: number; strikes: number; spares: number; alley: string };
}

export const SAMPLE_MESSAGES: Record<string, ChatMessage[]> = {
  'tuesday-crew': [
    {
      id: 'm1',
      authorId: 'kenji',
      author: 'Kenji Mori',
      initials: 'KM',
      time: '19:04',
      body: 'Lane 6 is drying out fast — move right two boards after game two.',
    },
    {
      id: 'm2',
      authorId: 'aya',
      author: 'Aya Sato',
      initials: 'AS',
      time: '19:22',
      body: 'Confirmed. I went from a 4-pin leave every frame to carrying once I moved.',
    },
    {
      id: 'm3',
      authorId: 'you',
      author: 'You',
      initials: 'YOU',
      time: '20:58',
      body: 'Shared a game to the dashboard.',
      sharedScore: { score: 212, strikes: 6, spares: 3, alley: 'Round One Kawasaki' },
    },
    {
      id: 'm4',
      authorId: 'rika',
      author: 'Rika Tanabe',
      initials: 'RT',
      time: '21:40',
      body: 'Nice. That back half is the best you have thrown all season.',
    },
  ],
  'round-one-regulars': [
    {
      id: 'r1',
      authorId: 'kenji',
      author: 'Kenji Mori',
      initials: 'KM',
      time: 'Aug 27',
      body: 'New Phaze surface came in. Taking it out Thursday if anyone wants a look.',
    },
  ],
};

export interface SharedGame {
  id: string;
  authorId: string;
  author: string;
  initials: string;
  when: string;
  alley: string;
  score: number;
  strikes: number;
  spares: number;
  /** Yours can be retracted; it stays in your own history either way. */
  isYours?: boolean;
}

export const SAMPLE_SHARED: Record<string, SharedGame[]> = {
  'tuesday-crew': [
    { id: 's1', authorId: 'aya', author: 'Aya Sato', initials: 'AS', when: 'Aug 30', alley: 'Round One Kawasaki', score: 234, strikes: 8, spares: 2 },
    { id: 's2', authorId: 'you', author: 'You', initials: 'YOU', when: 'Aug 29', alley: 'Round One Kawasaki', score: 212, strikes: 6, spares: 3, isYours: true },
    { id: 's3', authorId: 'kenji', author: 'Kenji Mori', initials: 'KM', when: 'Aug 28', alley: 'Rose Bowl Lanes', score: 268, strikes: 10, spares: 1 },
  ],
  'round-one-regulars': [],
};
