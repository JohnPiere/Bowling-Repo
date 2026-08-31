/**
 * Group leaderboard ranking.
 *
 * Every visual property of the board — rank, bar width, podium order, the
 * movement arrows — is derived here and nowhere else. The dashboard renders
 * what this returns, which keeps the "rows slide rather than re-mount"
 * behaviour a pure question of layout rather than of bookkeeping.
 */

export type MetricKey = 'avg' | 'high' | 'pins' | 'hdcp' | 'imp';

export interface Member {
  id: string;
  name: string;
  initials: string;
  avg: number;
  high: number;
  pins: number;
  /** Average plus handicap, so bowlers of different standards share a board. */
  hdcp: number;
  /** Change against this bowler's own first-ten-game baseline. */
  imp: number;
  games: number;
  since: string;
  isMe?: boolean;
}

export interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  note: string;
  get: (member: Member) => number;
  format: (value: number) => string;
}

export const METRICS: Metric[] = [
  {
    key: 'avg',
    label: 'Rolling avg',
    unit: 'last 10 games',
    note: 'Average of the ten most recent games shared here.',
    get: (m) => m.avg,
    format: String,
  },
  {
    key: 'high',
    label: 'Season high',
    unit: 'best single game',
    note: 'Highest single game since the season opened in January.',
    get: (m) => m.high,
    format: String,
  },
  {
    key: 'pins',
    label: 'Pins this month',
    unit: 'august total',
    note: 'Total pins felled in August — rewards showing up, not peaking.',
    get: (m) => m.pins,
    format: (v) => v.toLocaleString('en-US'),
  },
  {
    key: 'hdcp',
    label: 'Handicap avg',
    unit: '90% of 220',
    note: 'Average plus handicap, so a 150 bowler and a 200 bowler can share one board.',
    get: (m) => m.hdcp,
    format: String,
  },
  {
    key: 'imp',
    label: 'Improvement',
    unit: 'vs own baseline',
    note: "Change against each bowler's own first-ten-game baseline.",
    get: (m) => m.imp,
    format: (v) => (v > 0 ? '+' : '') + v,
  },
];

export function metricByKey(key: MetricKey): Metric {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export interface Standing {
  member: Member;
  /** 1-based position on the current metric. */
  rank: number;
  value: number;
  formatted: string;
  /** Bar width, 8%–92%, so last place still shows a bar. */
  barPercent: number;
  /** Places gained against the rolling-average board. Positive is upward. */
  movement: number;
  isPodium: boolean;
}

/** Row geometry. The board positions rows by `top`, so these are shared. */
export const ROW_HEIGHT = 54;
export const ROW_GAP = 7;

export function boardHeight(memberCount: number): number {
  return memberCount * (ROW_HEIGHT + ROW_GAP) - ROW_GAP;
}

/** Pixel offset that encodes a rank. */
export function rowOffset(rank: number): number {
  return (rank - 1) * (ROW_HEIGHT + ROW_GAP);
}

/**
 * Rank a roster on one metric.
 *
 * Returns standings in **roster order**, not rank order: the board keeps a
 * fixed DOM child list keyed by member so that switching metric only moves
 * rows, and re-sorting the array here would defeat that.
 */
export function rankRoster(members: Member[], metricKey: MetricKey): Standing[] {
  const metric = metricByKey(metricKey);
  if (members.length === 0) return [];

  const values = members.map(metric.get);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A group where everyone is level would divide by zero; one keeps the bars
  // uniform instead.
  const span = Math.max(1, max - min);

  const rankOf = ranksBy(members, metric.get);
  // Movement is always measured against the rolling average — the board's
  // default view — so "▲2" means the same thing on every metric.
  const baseRankOf = ranksBy(members, (m) => m.avg);

  return members.map((member) => {
    const rank = rankOf.get(member.id) as number;
    const value = metric.get(member);

    return {
      member,
      rank,
      value,
      formatted: metric.format(value),
      barPercent: Math.round(8 + ((value - min) / span) * 84),
      movement: (baseRankOf.get(member.id) as number) - rank,
      isPodium: rank <= 3,
    };
  });
}

/** Rank members by a value getter, highest first. */
function ranksBy(members: Member[], get: (m: Member) => number): Map<string, number> {
  const order = [...members].sort((a, b) => get(b) - get(a));
  return new Map(order.map((member, index) => [member.id, index + 1]));
}

export interface PodiumSlot {
  standing: Standing;
  place: 1 | 2 | 3;
  barHeight: number;
  avatarSize: number;
  valueSize: number;
  /** Stagger for the `rise` entrance. */
  delay: string;
}

/**
 * The top three, ordered 2nd · 1st · 3rd so the leader stands in the middle.
 * Returns fewer slots for a group too small to fill a podium.
 */
export function podium(standings: Standing[]): PodiumSlot[] {
  const byRank = [...standings].sort((a, b) => a.rank - b.rank);

  const shape = [
    { place: 2 as const, barHeight: 52, avatarSize: 34, valueSize: 16, delay: '0.04s' },
    { place: 1 as const, barHeight: 74, avatarSize: 42, valueSize: 20, delay: '0s' },
    { place: 3 as const, barHeight: 40, avatarSize: 32, valueSize: 15, delay: '0.08s' },
  ];

  return shape
    .map((slot) => ({ ...slot, standing: byRank[slot.place - 1] }))
    .filter((slot): slot is PodiumSlot => Boolean(slot.standing));
}

/** "▲2" / "▼1" / "–", or empty on the board movement is measured against. */
export function movementGlyph(movement: number, metricKey: MetricKey): string {
  if (metricKey === 'avg') return '';
  if (movement > 0) return `▲${movement}`;
  if (movement < 0) return `▼${-movement}`;
  return '–';
}

/** The sentence under the hero bar, describing where the bowler moved. */
export function movementSentence(movement: number, metricKey: MetricKey): string {
  if (metricKey === 'avg') return "the group's default board";
  const places = `place${Math.abs(movement) > 1 ? 's' : ''}`;
  if (movement > 0) return `▲ ${movement} ${places} vs rolling avg`;
  if (movement < 0) return `▼ ${-movement} ${places} vs rolling avg`;
  return 'same place as the rolling avg';
}
