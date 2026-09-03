import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { t, tf } from '../lib/i18n';
import { formatDay, fromInputs, toDateInput } from '../lib/datetime';
import {
  CHALLENGE_METRICS,
  canDelete,
  challengeStandings,
  challengeState,
  challengeTotal,
  createChallenge,
  daysLeft,
  deleteChallenge,
  loadChallenges,
  problemWithDraft,
  type Challenge,
  type ChallengeMetric,
} from '../lib/challenges';
import { loadSharedGames, type Group, type SharedGame } from '../lib/social';

interface Props {
  group: Group;
  me: string;
}

/** A month from today, which is what most of these want to be. */
function defaultWindow() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { start: toDateInput(now.getTime()), end: toDateInput(end.getTime()) };
}

/**
 * Something for the crew to chase.
 *
 * Nothing on this screen is stored as progress. A challenge is a target and a
 * window; where everybody stands is the games they shared inside it, counted by
 * the same `tally` the analytics screen uses on your own season. That is the
 * whole design and it has one consequence worth repeating in the interface as
 * often as it takes: **only shared games count**, because shared games are all
 * a crew can see. Somebody who bowls 300 and keeps it to themselves has not
 * moved the bar, and would otherwise conclude the app is broken.
 */
export function ChallengesScreen({ group, me }: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<SharedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('strikes');
  const [target, setTarget] = useState('100');
  const [window, setWindow] = useState(defaultWindow);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([loadChallenges(group.id), loadSharedGames(group.id, me)]).then(
      ([list, shared]) => {
        setChallenges(list);
        setPosts(shared);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [group.id, me]);

  useEffect(refresh, [refresh]);

  const memberIds = useMemo(() => group.members.map((member) => member.id), [group.members]);
  const owner = useMemo(
    () => group.members.find((member) => member.role === 'owner')?.id ?? null,
    [group.members],
  );
  // The shape a challenge counts: who bowled it, the balls, and when.
  const counted = useMemo(
    () => posts.map((post) => ({ authorId: post.authorId, rolls: post.rolls, playedAt: post.playedAt })),
    [posts],
  );

  const draft = {
    name,
    metric,
    target: Number(target),
    startsAt: fromInputs(window.start, '00:00') ?? Number.NaN,
    // Through the end of the last day rather than its first instant, so a
    // challenge that runs "to the 31st" includes the 31st.
    endsAt: (fromInputs(window.end, '00:00') ?? Number.NaN) + 86_400_000,
  };
  const problem = creating ? problemWithDraft(draft) : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await createChallenge(group.id, me, draft);
      setCreating(false);
      setName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteChallenge(id);
      setChallenges((current) => current.filter((one) => one.id !== id));
    } catch {
      // Nothing changed, so leaving the row is the honest outcome.
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="empty">{t('Loading…')}</p>;

  return (
    <>
      {!creating && (
        <button type="button" className="btn-lg btn-lg--primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          {t('Set a challenge')}
        </button>
      )}

      {creating && (
        <div className="card">
          <label style={{ display: 'block', marginBottom: 11 }}>
            <span className="hero__label">{t('What is it called')}</span>
            <input
              className="input"
              style={{ marginTop: 5 }}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('100 strikes before April')}
              maxLength={80}
            />
          </label>

          <span className="hero__label">{t('Counting')}</span>
          <div className="chips" role="group" aria-label={t('Counting')} style={{ marginTop: 5 }}>
            {CHALLENGE_METRICS.map((one) => (
              <button
                key={one.key}
                type="button"
                className="chip"
                aria-pressed={metric === one.key}
                onClick={() => setMetric(one.key)}
              >
                {t(one.label)}
              </button>
            ))}
          </div>

          <label style={{ display: 'block', margin: '11px 0' }}>
            <span className="hero__label">{t('How many')}</span>
            <input
              className="input tnum"
              style={{ marginTop: 5 }}
              type="number"
              inputMode="numeric"
              min={1}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>

          <div className="row" style={{ gap: 11, marginBottom: 11 }}>
            <label className="grow">
              <span className="hero__label">{t('From')}</span>
              <input
                className="input tnum"
                style={{ marginTop: 5 }}
                type="date"
                value={window.start}
                onChange={(event) => setWindow((w) => ({ ...w, start: event.target.value }))}
              />
            </label>
            <label className="grow">
              <span className="hero__label">{t('Until')}</span>
              <input
                className="input tnum"
                style={{ marginTop: 5 }}
                type="date"
                value={window.end}
                onChange={(event) => setWindow((w) => ({ ...w, end: event.target.value }))}
              />
            </label>
          </div>

          {(problem || error) && (
            // The message comes back from `lib/` as its English source
            // text, which is exactly what `t` is keyed on — the one place
            // in the app where the key is a value rather than a literal.
            <div className="note note--bad">{problem ? t(problem) : error}</div>
          )}

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            disabled={busy || problem !== null}
            onClick={() => void save()}
          >
            {busy ? t('Saving…') : t('Set it')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
          >
            {t('Cancel')}
          </button>
        </div>
      )}

      {challenges.length === 0 && !creating && (
        <p className="empty">
          {t('No challenges yet. Set one and the crew has something to chase.')}
        </p>
      )}

      {challenges.map((challenge) => {
        const standings = challengeStandings(challenge, memberIds, counted);
        const total = challengeTotal(challenge, standings);
        const state = challengeState(challenge);
        const unit = CHALLENGE_METRICS.find((one) => one.key === challenge.metric)?.unit ?? '';

        return (
          <div key={challenge.id} className="card" style={{ marginTop: 11 }}>
            <div className="row row--between" style={{ marginBottom: 4 }}>
              <span className="grow">
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>
                  {challenge.name}
                </span>
                <span className="muted">
                  {tf('{target} {unit} · {from} to {to}', {
                    target: challenge.target,
                    unit: t(unit),
                    from: formatDay(challenge.startsAt),
                    to: formatDay(challenge.endsAt - 1),
                  })}
                </span>
              </span>
              <span className={`pill${state === 'running' ? ' pill--on' : ''}`}>
                {state === 'upcoming'
                  ? t('Not started')
                  : state === 'running'
                    ? tf('{n} days left', { n: daysLeft(challenge) })
                    : t('Finished')}
              </span>
            </div>

            {/* The crew's own bar, above the people. Both readings matter and
                the team one is the reason somebody set a shared target. */}
            <div className="row row--between" style={{ margin: '10px 0 4px' }}>
              <span style={{ fontSize: 13 }}>{t('The crew')}</span>
              <span className="tnum" style={{ fontSize: 15 }}>
                {total.value} / {challenge.target}
              </span>
            </div>
            <span className="progress">
              <span className="leave-row__fill" style={{ width: `${Math.max(2, total.percent)}%` }} />
            </span>

            <div style={{ marginTop: 12 }}>
              {standings.map((row) => {
                const member = group.members.find((one) => one.id === row.memberId);
                if (!member) return null;

                return (
                  <div key={row.memberId} className="leave-row">
                    <Avatar
                      initials={member.initials}
                      size={26}
                      isMe={member.isMe}
                      photo={member.photo}
                    />
                    <span className="grow">
                      <span style={{ display: 'block', fontSize: 13 }}>
                        {member.isMe ? t('You') : member.name}
                        {row.done && ' ★'}
                      </span>
                      <span className="muted tnum">
                        {tf('{value} of {target}', { value: row.value, target: challenge.target })}
                      </span>
                    </span>
                    <span className="leave-row__bar">
                      <span
                        className="leave-row__fill"
                        style={{ width: `${Math.max(2, row.percent)}%` }}
                      />
                    </span>
                    <span className="tnum" style={{ fontSize: 13, minWidth: 34, textAlign: 'right' }}>
                      {row.percent}%
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="footnote" style={{ marginBottom: 0 }}>
              {t('Counted from games shared with this crew. A game you keep to yourself does not count.')}
            </p>

            {canDelete(challenge, me, owner) && (
              <button
                type="button"
                className="linkbtn linkbtn--centred"
                disabled={busy}
                onClick={() => void remove(challenge.id)}
              >
                {t('Delete this challenge')}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
