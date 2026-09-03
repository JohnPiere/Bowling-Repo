import { useEffect, useMemo, useState } from 'react';
import { t, tf } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { describeBackendFailure } from '../lib/backend';
import { leagueNights, loadLeague, type LeagueLine } from '../lib/league';
import type { Group } from '../lib/social';
import { formatDay, formatWeekday } from '../lib/datetime';

/**
 * The crew as a league.
 *
 * The board next door ranks averages, which is the fair way to compare people
 * who have bowled different numbers of games. This ranks **nights** — the
 * series, every game somebody bowled on one evening added up — because that is
 * the thing a league is about and the thing people remember. "I shot 620 on
 * Tuesday" is a sentence; "my rolling average moved 1.4" is not.
 *
 * Handicap is shown beside scratch rather than instead of it. Ninety percent of
 * the gap to 220 narrows the difference between a 150 bowler and a 200 bowler
 * without erasing it, and a table that only printed the handicapped figure
 * would hide what was actually bowled.
 */
export function LeagueScreen({ group, me }: { group: Group; me: string }) {
  const [lines, setLines] = useState<LeagueLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);

    loadLeague(group.id, me).then(
      (loaded) => live && setLines(loaded),
      (err) => {
        if (!live) return;
        setLines([]);
        setError(describeBackendFailure(err));
      },
    );

    return () => {
      live = false;
    };
  }, [group.id, me]);

  const nights = useMemo(() => (lines ? leagueNights(lines) : []), [lines]);
  const bowled = lines?.filter((line) => line.series.length > 0) ?? [];

  if (lines === null) return <p className="empty">{t('Working out the standings…')}</p>;

  return (
    <>
      {error && <div className="note note--bad">{error}</div>}

      <h2 className="section-title">{t('Best series')}</h2>
      {bowled.length === 0 ? (
        <p className="empty">
          {t('Nobody has shared a game with this crew yet. A league needs a night bowled.')}
        </p>
      ) : (
        <div className="card">
          <div className="league__row league__row--head">
            <span />
            <span>{t('Bowler')}</span>
            <span>{t('Hdcp')}</span>
            <span>{t('Scratch')}</span>
            <span>{t('Series')}</span>
          </div>

          {lines.map((line, index) => (
            <div
              key={line.id}
              className={`league__row${line.isMe ? ' league__row--me' : ''}`}
            >
              <span className="league__rank tnum">{line.best ? index + 1 : '—'}</span>
              <span className="league__who">
                <Avatar initials={line.initials} size={26} isMe={line.isMe} photo={line.photo} />
                <span className="league__name">{line.isMe ? t('You') : line.name}</span>
              </span>
              {/* The allowance, not the handicapped average: it is what gets
                  added to each of that night's games, and printing the average
                  here would not add up to the column beside it. */}
              <span className="tnum league__hdcp">{line.best ? `+${line.allowance}` : '—'}</span>
              <span className="tnum">{line.best?.scratch ?? '—'}</span>
              <span className="tnum league__series">{line.best?.withHandicap ?? '—'}</span>
            </div>
          ))}

          <p className="footnote" style={{ marginBottom: 0 }}>
            {t(
              'Each bowler’s best night, with their handicap on every game of it. Ninety percent of the gap to 220 — a league is meant to be competitive, not level.',
            )}
          </p>
        </div>
      )}

      {nights.length > 0 && (
        <>
          <h2 className="section-title">{t('Night by night')}</h2>
          {nights.map((night) => (
            <div key={night.key} className="card" style={{ marginBottom: 9 }}>
              <div className="row row--between" style={{ marginBottom: 8 }}>
                <span className="hero__label">{formatDay(night.at)}</span>
                <span className="muted">{formatWeekday(night.at, 'short')}</span>
              </div>

              {night.results.map(({ line, series }) => (
                <div key={line.id} className="league__row league__row--night">
                  <span className="league__who">
                    <Avatar initials={line.initials} size={24} isMe={line.isMe} photo={line.photo} />
                    <span className="league__name">{line.isMe ? t('You') : line.name}</span>
                  </span>
                  <span className="muted tnum">
                    {tf(series.games === 1 ? '{n} game' : '{n} games', { n: series.games })}
                  </span>
                  <span className="tnum">{series.scratch}</span>
                  <span className="tnum league__series">{series.withHandicap}</span>
                </div>
              ))}
            </div>
          ))}

          <p className="footnote">
            {t(
              'A bowler who was not there is not on that night. Only games shared with the crew count — a season kept private is still a season, it is just not in this competition.',
            )}
          </p>
        </>
      )}
    </>
  );
}
