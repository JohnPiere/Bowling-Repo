import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { t, tf } from '../lib/i18n';
import type { Group, SharedGame } from '../lib/social';
import { loadSharedGames } from '../lib/social';
import { METRICS, rankRoster } from '../lib/leaderboard';
import { TallyCard } from '../components/TallyCard';
import { tally, thisMonth } from '../lib/stats';
import { formatMonthYear } from '../lib/datetime';
import { battleRecord, loadBattles, type Battle, type BattleEntry } from '../lib/battles';

interface Props {
  group: Group;
  memberId: string;
  me: string;
}

/**
 * One member's season within this group.
 *
 * Only what they shared here is visible. A member's private games stay
 * private — being in a group is not an audit.
 */
export function MemberScreen({ group, memberId, me }: Props) {
  const member = group.members.find((m) => m.id === memberId) ?? group.members[0];
  const standings = rankRoster(group.members, 'avg');
  const standing = standings.find((s) => s.member.id === member.id);

  const [shared, setShared] = useState<SharedGame[]>([]);
  const [fights, setFights] = useState<{ battles: Battle[]; entries: BattleEntry[] }>({
    battles: [],
    entries: [],
  });

  // Only what they posted here. A member's private games stay private — being
  // in a crew is not an audit.
  useEffect(() => {
    let live = true;
    loadSharedGames(group.id, me).then(
      (posts) => {
        if (live) setShared(posts.filter((post) => post.authorId === member.id));
      },
      () => {
        if (live) setShared([]);
      },
    );
    return () => {
      live = false;
    };
  }, [group.id, member.id, me]);

  // Battles are the crew's, not this member's: `battleRecord` picks out the
  // ones they are in. Empty on failure, like every 0005-and-later loader — a
  // database still on 0005 loses the line and nothing else on the screen.
  useEffect(() => {
    let live = true;
    loadBattles(group.id).then(
      (loaded) => {
        if (live) setFights(loaded);
      },
      () => {
        if (live) setFights({ battles: [], entries: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [group.id]);

  const record = battleRecord(fights.battles, fights.entries, member.id);

  return (
    <>
      <section className="hero">
        <div className="orb" />
        <div className="row">
          <Avatar initials={member.initials} size={44} isMe={member.isMe} square photo={member.photo} />
          <div className="grow">
            <div className="hero__name">{member.isMe ? 'You' : member.name}</div>
            <div className="hero__meta">
              In {group.name} since {member.since} · rank {standing?.rank} of {group.members.length}
            </div>
          </div>
        </div>
      </section>

      <div className="quickstats">
        <Cell label="Rolling avg" value={member.avg} />
        <Cell label="High game" value={member.high} />
        <Cell label="Games" value={member.games} />
      </div>

      {record.played > 0 && (
        <>
          {/* Settled battles only — `battleRecord` says why: a lead in one
              still running can go back down, and a figure on somebody's
              profile that does that is worse than no figure. */}
          <h2 className="section-title">{t('Battles')}</h2>
          <div className="quickstats">
            <Cell label="Won" value={record.won} />
            <Cell label="Lost" value={record.lost} />
            <Cell label="Tied" value={record.drawn} />
          </div>
        </>
      )}

      <h2 className="section-title">{t('Across every board')}</h2>
      <div className="card">
        {METRICS.map((metric) => {
          const board = rankRoster(group.members, metric.key);
          const row = board.find((s) => s.member.id === member.id);
          if (!row) return null;

          return (
            <div key={metric.key} className="row row--between" style={{ padding: '6px 0' }}>
              <span className="grow">
                <span style={{ fontSize: 12, display: 'block' }}>{metric.label}</span>
                <span className="muted">{metric.unit}</span>
              </span>
              <span className="tnum" style={{ fontSize: 15 }}>
                {row.formatted}
              </span>
              <span
                className="tnum"
                style={{
                  fontSize: 11,
                  minWidth: 30,
                  textAlign: 'right',
                  color: row.isPodium ? 'var(--color-accent-300)' : 'var(--color-neutral-600)',
                }}
              >
                #{row.rank}
              </span>
            </div>
          );
        })}
      </div>

      {shared.length > 0 && (
        <>
          {/* Counted from what they posted here and nothing else — the same
              rule the list below follows. A member's own phone has the rest of
              their season on it and this screen has no business with it, so
              these numbers are honestly smaller than theirs and the footnote
              says which. */}
          <h2 className="section-title">{t('Counted up')}</h2>
          <TallyCard
            lifetime={tally(shared)}
            month={thisMonth(shared)}
            monthLabel={formatMonthYear(Date.now())}
          />
          <p className="footnote" style={{ margin: '-6px 0 4px' }}>
            {member.isMe
              ? t('From the games you shared here, not your whole season.')
              : tf('From the games {name} shared here, not their whole season.', {
                  name: member.name.split(' ')[0],
                })}
          </p>
        </>
      )}

      <h2 className="section-title">{t('Shared with this group')}</h2>
      {shared.length === 0 ? (
        <p className="empty">
          {member.isMe ? 'You have' : `${member.name.split(' ')[0]} has`} not shared a game here
          yet.
        </p>
      ) : (
        shared.map((post) => (
          <div key={post.id} className="game-row" style={{ cursor: 'default' }}>
            <span className="game-row__score tnum">{post.score}</span>
            <span className="grow">
              <span className="game-row__name" style={{ display: 'block' }}>
                {post.when} · {post.alley}
              </span>
              <span className="game-row__sub tnum">
                {post.strikes} strikes · {post.spares} spares
              </span>
            </span>
          </div>
        ))
      )}

      <p className="footnote">
        Only games shared into {group.name} appear here. Everything else stays on their own device.
      </p>
    </>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="quickstat">
      <div className="quickstat__value tnum">{value}</div>
      {/* The label arrives as the English source text, which is the key. This
          did not go through `t` before and put "Rolling avg" in the middle of
          a Japanese screen. */}
      <div className="quickstat__label">{t(label)}</div>
    </div>
  );
}
