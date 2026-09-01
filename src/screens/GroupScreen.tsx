import { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { SAMPLE_FEED } from '../data/roster';
import type { Group } from '../data/groups';
import {
  boardHeight,
  METRICS,
  metricByKey,
  movementGlyph,
  movementSentence,
  podium,
  rankRoster,
  rowOffset,
  type MetricKey,
  type Standing,
} from '../lib/leaderboard';

/**
 * The group dashboard.
 *
 * The leaderboard is the point of this screen. Its one non-obvious rule: the
 * board's rows stay in roster order in the DOM and carry their rank in `top`,
 * so switching metric slides them to their new places. Sorting the array
 * before rendering would re-mount the rows and throw the animation away.
 */
interface Props {
  group: Group;
  onOpenMember?: (memberId: string) => void;
  onOpenChat?: () => void;
  onOpenSettings?: () => void;
  onOpenShared?: () => void;
}

export function GroupScreen({
  group,
  onOpenMember,
  onOpenChat,
  onOpenSettings,
  onOpenShared,
}: Props) {
  const [metricKey, setMetricKey] = useState<MetricKey>('avg');

  const roster = group.members;
  const metric = metricByKey(metricKey);
  const standings = useMemo(() => rankRoster(roster, metricKey), [roster, metricKey]);
  const places = useMemo(() => podium(standings), [standings]);

  const mine = standings.find((s) => s.member.isMe) ?? standings[0];
  const groupAverage = Math.round(roster.reduce((sum, m) => sum + m.avg, 0) / roster.length);
  const totalPins = roster.reduce((sum, m) => sum + m.pins, 0);

  return (
    <>
      <section className="hero">
        <div className="orb" />

        <div className="row">
          <span className="hero__avatar">{group.initials}</span>
          <div className="grow">
            <div className="hero__name">{group.name}</div>
            <div className="hero__meta">
              {roster.length} members · {group.isOpen ? 'open' : 'invite-only'}
              {group.yourRole === 'owner' ? ' · you own it' : ''}
            </div>
          </div>
          <button
            type="button"
            className="iconbtn"
            aria-label={t('Group settings')}
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={18} />
          </button>
          <button
            type="button"
            className="iconbtn iconbtn--accent"
            aria-label={t('Group chat')}
            onClick={onOpenChat}
          >
            <Icon name="chat" size={18} />
            {group.unread > 0 && <span className="iconbtn__badge">{group.unread}</span>}
          </button>
        </div>

        <div className="hero__standing">
          <div>
            <div className="hero__label">{t('Your rank')}</div>
            <div className="hero__numeral tnum">{mine.rank}</div>
            <div className="hero__meta">of {roster.length}</div>
          </div>

          <div className="grow">
            <div className="row row--between">
              <span className="hero__meta">{metric.label}</span>
              <span className="tnum" style={{ fontSize: 21, letterSpacing: '-0.02em' }}>
                {mine.formatted}
              </span>
            </div>
            <div className="hero__bar-track">
              <div className="hero__bar-fill" style={{ width: `${mine.barPercent}%` }} />
            </div>
            <div
              style={{
                fontSize: 10.5,
                marginTop: 5,
                color:
                  metricKey === 'avg' || mine.movement === 0
                    ? 'var(--color-neutral-500)'
                    : mine.movement > 0
                      ? 'var(--color-accent-300)'
                      : 'var(--negative)',
              }}
            >
              {movementSentence(mine.movement, metricKey)}
            </div>
          </div>
        </div>

        <div className="hero__pulse">
          {[
            { label: 'Group avg', value: groupAverage },
            { label: 'Games this week', value: gamesThisWeek(roster) },
            { label: 'Pins in August', value: `${(totalPins / 1000).toFixed(1)}k` },
          ].map((cell) => (
            <div key={cell.label}>
              <div className="hero__pulse-value tnum">{cell.value}</div>
              <div className="hero__pulse-label">{cell.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="chips" role="group" aria-label={t('Leaderboard metric')}>
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            className="chip"
            aria-pressed={m.key === metricKey}
            onClick={() => setMetricKey(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="muted" style={{ margin: '0 0 12px' }}>
        {metric.note}
      </p>

      <div className="podium">
        {places.map((slot) => {
          const isLeader = slot.place === 1;
          const { member } = slot.standing;

          return (
            <div key={member.id} className="podium__col" style={{ animationDelay: slot.delay }}>
              <Avatar
                initials={member.initials}
                size={slot.avatarSize}
                isMe={member.isMe}
                isLeader={isLeader}
              />
              <div
                className="podium__name"
                style={{ color: member.isMe ? '#cfc7ff' : 'var(--color-neutral-200)' }}
              >
                {member.isMe ? 'You' : member.name.split(' ')[0]}
              </div>
              <div
                className="tnum"
                style={{
                  fontSize: slot.valueSize,
                  color: isLeader ? '#cfc7ff' : 'var(--color-text)',
                }}
              >
                {slot.standing.formatted}
              </div>
              <div
                className="podium__bar"
                style={{
                  height: slot.barHeight,
                  background: isLeader
                    ? 'linear-gradient(180deg,rgba(145,132,217,.34),rgba(145,132,217,.06))'
                    : 'linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.01))',
                  boxShadow: `inset 0 0 0 1px ${
                    isLeader ? 'var(--color-accent-700)' : 'var(--color-neutral-800)'
                  }`,
                }}
              >
                <span
                  className="podium__rank tnum"
                  style={{ color: isLeader ? '#cfc7ff' : 'var(--color-neutral-400)' }}
                >
                  {slot.place}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="board" style={{ height: boardHeight(standings.length) }}>
        {standings.map((standing) => (
          <BoardRow
            key={standing.member.id}
            standing={standing}
            metricKey={metricKey}
            onOpen={() => onOpenMember?.(standing.member.id)}
          />
        ))}
      </div>

      <p className="footnote">
        Switching the metric re-ranks in place — rows slide to their new position. Tap anyone to see
        their season.
      </p>

      <button
        type="button"
        className="btn-lg"
        style={{ marginTop: 4 }}
        onClick={onOpenShared}
      >
        <Icon name="share" size={18} />
        {t('Shared games')}
      </button>

      <h2 className="section-title">{t('Recent activity')}</h2>
      <div className="card">
        {SAMPLE_FEED.map((item) => (
          <div key={item.text} className="row" style={{ padding: '5px 0' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flex: 'none',
                background:
                  item.tone === 'accent'
                    ? 'var(--color-accent)'
                    : item.tone === 'down'
                      ? 'var(--negative)'
                      : 'var(--color-neutral-600)',
              }}
            />
            <span className="grow" style={{ fontSize: 12 }}>
              {item.text}
            </span>
            <span className="muted tnum">{item.time}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function BoardRow({
  standing,
  metricKey,
  onOpen,
}: {
  standing: Standing;
  metricKey: MetricKey;
  onOpen: () => void;
}) {
  const { member, rank, isPodium, movement, barPercent, formatted } = standing;
  const isMe = Boolean(member.isMe);

  const barBackground = isMe
    ? 'linear-gradient(90deg,rgba(145,132,217,.30),rgba(145,132,217,.04))'
    : isPodium
      ? 'linear-gradient(90deg,rgba(145,132,217,.16),rgba(145,132,217,.02))'
      : 'linear-gradient(90deg,rgba(255,255,255,.07),rgba(255,255,255,.01))';

  const glyph = movementGlyph(movement, metricKey);

  return (
    <button
      type="button"
      className={`board__row${isMe ? ' board__row--me' : ''}`}
      style={{ top: rowOffset(rank) }}
      onClick={onOpen}
    >
      <span className="board__bar" style={{ width: `${barPercent}%`, background: barBackground }} />

      <span className="board__content">
        <span
          className="board__rank tnum"
          style={{ color: isPodium ? 'var(--color-accent-200)' : 'var(--color-neutral-600)' }}
        >
          {rank}
        </span>

        <Avatar initials={member.initials} size={30} isMe={isMe} />

        <span className="grow">
          <span
            className="board__name"
            style={{ color: isMe ? '#cfc7ff' : 'var(--color-text)', display: 'block' }}
          >
            {member.name}
          </span>
          <span className="board__sub tnum">
            {member.games} games · high {member.high}
          </span>
        </span>

        {glyph && (
          <span
            className="board__move tnum"
            style={{
              color:
                movement > 0
                  ? 'var(--color-accent-300)'
                  : movement < 0
                    ? 'var(--negative)'
                    : 'var(--color-neutral-700)',
            }}
          >
            {glyph}
          </span>
        )}

        <span style={{ textAlign: 'right' }}>
          <span
            className="board__value tnum"
            style={{ color: rank === 1 ? '#b5abfc' : 'var(--color-text)', display: 'block' }}
          >
            {formatted}
          </span>
          <span
            className="board__delta tnum"
            style={{ color: member.imp > 0 ? 'var(--color-accent-300)' : 'var(--negative)' }}
          >
            {member.imp > 0 ? '+' : ''}
            {member.imp} vs base
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Games the group has logged this week.
 *
 * Sample data carries no per-game timestamps, so this is derived from the
 * roster rather than invented — a real feed replaces it with a count.
 */
function gamesThisWeek(roster: { games: number }[]): number {
  return Math.max(1, Math.round(roster.reduce((sum, m) => sum + m.games, 0) / 6));
}
