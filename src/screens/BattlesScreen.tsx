import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { t, tf } from '../lib/i18n';
import { formatDay, toDateInput, fromInputs } from '../lib/datetime';
import { listGames, type Game } from '../lib/db';
import {
  battleOrder,
  battleResult,
  createBattle,
  daysLeftIn,
  deleteBattle,
  enterScore,
  entryScore,
  isIn,
  loadBattles,
  problemWithBattle,
  withdrawEntry,
  type Battle,
  type BattleEntry,
  type BattleResult,
} from '../lib/battles';
import type { Group } from '../lib/social';
import type { Member } from '../lib/leaderboard';

interface Props {
  group: Group;
  me: string;
}

/** A week out, which is what a battle bowled on two different evenings wants. */
function defaultDeadline(): string {
  return toDateInput(Date.now() + 7 * 86_400_000);
}

/**
 * Two people, one game each, days apart.
 *
 * The rest of the crew screens compare seasons; this one is a bet. What makes
 * it work is that the two games need not be the same evening — somebody bowls
 * Tuesday, somebody else bowls Friday, and the deadline closes it — so the
 * screen's job is mostly to be honest about which of those two things has
 * happened yet.
 *
 * A score is *entered* here rather than counted off the board, and that is the
 * one place the social layer stores a number it could not derive. See the note
 * at the top of `lib/battles.ts`: which of your games you meant to put up is a
 * decision, not a computation. Picking one out of your own season is offered
 * first because a picked game carries its frames and cannot be a typo; typing
 * one is still allowed, because a game bowled before the app existed is a game.
 */
export function BattlesScreen({ group, me }: Props) {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [entries, setEntries] = useState<BattleEntry[]>([]);
  const [mine, setMine] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [opponentId, setOpponentId] = useState('');
  const [deadline, setDeadline] = useState(defaultDeadline);

  /** Which battle's entry form is open, and what is typed into it. */
  const [entering, setEntering] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    loadBattles(group.id).then(
      ({ battles: list, entries: rows }) => {
        setBattles(list);
        setEntries(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [group.id]);

  useEffect(refresh, [refresh]);

  // Your own season, for picking a game to put up. It is on this phone rather
  // than in the crew's database, which is why a battle can stand on a game you
  // never shared: entering it here is the deliberate act, not sharing it.
  useEffect(() => {
    let live = true;
    listGames().then(
      (games) => {
        if (live) setMine(games.filter((game) => game.isComplete).slice(0, 40));
      },
      () => {
        if (live) setMine([]);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const others = useMemo(() => group.members.filter((one) => one.id !== me), [group.members, me]);
  const owner = useMemo(
    () => group.members.find((one) => one.role === 'owner')?.id ?? null,
    [group.members],
  );
  const ordered = useMemo(
    () => battleOrder(battles, entries, me),
    [battles, entries, me],
  );

  const draft = {
    name,
    opponentId,
    // Through the end of the chosen day rather than its first instant, so a
    // battle that runs "to Sunday" includes Sunday.
    endsAt: (fromInputs(deadline, '00:00') ?? Number.NaN) + 86_400_000,
  };
  const problem = creating ? problemWithBattle(draft, me) : null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await createBattle(group.id, me, draft);
      setCreating(false);
      setName('');
      setOpponentId('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function put(battleId: string, score: number, rolls: number[], playedAt: number) {
    setBusy(true);
    setError(null);
    try {
      await enterScore(battleId, me, { score, rolls, playedAt });
      setEntering(null);
      setTyped('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('That could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(battleId: string) {
    setBusy(true);
    try {
      await withdrawEntry(battleId, me);
      refresh();
    } catch {
      // Nothing changed, so leaving the row where it is stays honest.
    } finally {
      setBusy(false);
    }
  }

  async function callOff(id: string) {
    setBusy(true);
    try {
      await deleteBattle(id);
      setBattles((current) => current.filter((one) => one.id !== id));
    } catch {
      // As above.
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="empty">{t('Loading…')}</p>;

  return (
    <>
      {!creating && (
        <button type="button" className="btn-lg btn-lg--primary" onClick={() => setCreating(true)}>
          <Icon name="target" size={18} />
          {t('Start a battle')}
        </button>
      )}

      {creating &&
        (others.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              {t('There is nobody else in this crew yet. A battle needs two.')}
            </p>
            <button type="button" className="btn-lg" style={{ marginTop: 11 }} onClick={() => setCreating(false)}>
              {t('Cancel')}
            </button>
          </div>
        ) : (
          <div className="card">
            <label style={{ display: 'block', marginBottom: 11 }}>
              <span className="hero__label">{t('What is it called')}</span>
              <input
                className="input"
                style={{ marginTop: 5 }}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('Best game this week')}
                maxLength={80}
              />
            </label>

            <span className="hero__label">{t('Against')}</span>
            <div className="chips" role="group" aria-label={t('Against')} style={{ marginTop: 5 }}>
              {others.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  className="chip"
                  aria-pressed={opponentId === one.id}
                  onClick={() => setOpponentId(one.id)}
                >
                  {one.name}
                </button>
              ))}
            </div>

            <label style={{ display: 'block', margin: '11px 0' }}>
              <span className="hero__label">{t('Both bowl by')}</span>
              <input
                className="input tnum"
                style={{ marginTop: 5 }}
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </label>

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
              onClick={() => void start()}
            >
              {busy ? t('Saving…') : t('Put it up')}
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
        ))}

      {ordered.length === 0 && !creating && (
        <p className="empty">
          {t('No battles yet. Put one up and somebody has to answer it.')}
        </p>
      )}

      {ordered.map((battle) => {
        const result = battleResult(battle, entries, Date.now());
        const yours = isIn(battle, me);
        const yourEntry = result.challenger?.memberId === me ? result.challenger : result.opponent?.memberId === me ? result.opponent : null;

        return (
          <div key={battle.id} className="card" style={{ marginTop: 11 }}>
            <div className="row row--between" style={{ marginBottom: 8 }}>
              <span className="grow">
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>
                  {battle.name}
                </span>
                <span className="muted">
                  {result.final
                    ? tf('Closed {day}', { day: formatDay(battle.endsAt - 1) })
                    : tf('Both bowl by {day}', { day: formatDay(battle.endsAt - 1) })}
                </span>
              </span>
              <StatePill result={result} />
            </div>

            <Side
              memberId={battle.challengerId}
              entry={result.challenger}
              result={result}
              members={group.members}
            />
            <Side
              memberId={battle.opponentId}
              entry={result.opponent}
              result={result}
              members={group.members}
            />

            <Verdict result={result} members={group.members} me={me} />

            {yours && !result.final && (
              <>
                {entering === battle.id ? (
                  <div style={{ marginTop: 11 }}>
                    <span className="hero__label">{t('Put a game up')}</span>

                    {mine.length > 0 && (
                      <div className="chips" style={{ marginTop: 5 }}>
                        {mine.slice(0, 8).map((game) => (
                          <button
                            key={game.id}
                            type="button"
                            className="chip tnum"
                            disabled={busy}
                            onClick={() => void put(battle.id, game.total, game.rolls, game.playedAt)}
                          >
                            {game.total} · {formatDay(game.playedAt)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Typing is still offered: a game bowled before the app
                        existed, or on somebody else's phone, is still a game. */}
                    <div className="row" style={{ gap: 11, marginTop: 11 }}>
                      <label className="grow">
                        <span className="hero__label">{t('Or a score')}</span>
                        <input
                          className="input tnum"
                          style={{ marginTop: 5 }}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={300}
                          value={typed}
                          onChange={(event) => setTyped(event.target.value)}
                        />
                      </label>
                    </div>

                    {error && <div className="note note--bad" style={{ marginTop: 11 }}>{error}</div>}

                    <button
                      type="button"
                      className="btn-lg btn-lg--primary"
                      style={{ marginTop: 11 }}
                      disabled={busy || typed.trim() === ''}
                      onClick={() => void put(battle.id, Number(typed), [], Date.now())}
                    >
                      {busy ? t('Saving…') : t('Enter it')}
                    </button>
                    <button
                      type="button"
                      className="btn-lg"
                      style={{ marginTop: 11 }}
                      onClick={() => {
                        setEntering(null);
                        setError(null);
                      }}
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`btn-lg${yourEntry ? '' : ' btn-lg--primary'}`}
                    style={{ marginTop: 11 }}
                    disabled={busy}
                    onClick={() => {
                      setEntering(battle.id);
                      setTyped('');
                      setError(null);
                    }}
                  >
                    <Icon name="plus" size={18} />
                    {yourEntry ? t('Put up a different game') : t('Put a game up')}
                  </button>
                )}

                {yourEntry && entering !== battle.id && (
                  <button
                    type="button"
                    className="linkbtn linkbtn--centred"
                    disabled={busy}
                    onClick={() => void withdraw(battle.id)}
                  >
                    {t('Take my game back out')}
                  </button>
                )}
              </>
            )}

            {/* While it runs, either side may end it — turning one down has to
                be possible and deleting it is the only way to say no. Once it
                has settled it is a record, and the policy in 0006 leaves it to
                the crew's owner: a loser who can delete their losses makes the
                battles-won figure on every profile mean nothing. */}
            {(result.final ? me === owner : yours || me === owner) && (
              <button
                type="button"
                className="linkbtn linkbtn--centred"
                disabled={busy}
                onClick={() => void callOff(battle.id)}
              >
                {result.final
                  ? t('Remove this battle')
                  : battle.opponentId === me
                    ? t('Turn this battle down')
                    : t('Call this battle off')}
              </button>
            )}
          </div>
        );
      })}

      <p className="footnote">
        {t(
          'A score entered here is the game you are putting up — it does not have to be one you shared, and sharing one does not enter it.',
        )}
      </p>
    </>
  );
}

/** Where it stands, in as many words as fit on a pill. */
function StatePill({ result }: { result: BattleResult }) {
  if (!result.final) {
    return (
      <span className="pill pill--on">
        {tf('{n} days left', { n: daysLeftIn(result.battle) })}
      </span>
    );
  }
  if (result.outcome === 'void') return <span className="pill pill--warn">{t('Nobody bowled')}</span>;
  return <span className="pill">{t('Finished')}</span>;
}

/**
 * One side of it.
 *
 * A side with no game up is drawn as a waiting row rather than left out: the
 * shape of a battle is two people, and a card with one name on it looks like
 * the other one is not in the crew.
 */
function Side({
  memberId,
  entry,
  result,
  members,
}: {
  memberId: string;
  entry: BattleEntry | null;
  result: BattleResult;
  members: Member[];
}) {
  const member = members.find((one) => one.id === memberId);
  // Settled only. A lead on Tuesday is not a result, and a star against it
  // says it is — the same reason the score below is not coloured yet.
  const won = result.final && result.winnerId === memberId;

  return (
    <div className="leave-row">
      <Avatar
        initials={member?.initials ?? '—'}
        size={26}
        isMe={member?.isMe ?? false}
        photo={member?.photo}
      />
      <span className="grow">
        <span style={{ display: 'block', fontSize: 13 }}>
          {member?.isMe ? t('You') : (member?.name ?? t('Someone who left'))}
          {won && ' ★'}
        </span>
        <span className="muted tnum">
          {entry
            ? tf('bowled {day}', { day: formatDay(entry.playedAt) })
            : result.final
              ? t('never bowled')
              : t('still to bowl')}
        </span>
      </span>
      <span
        className="tnum"
        style={{
          fontSize: 22,
          fontWeight: 600,
          minWidth: 52,
          textAlign: 'right',
          // The winner in the accent, and only once it is settled — a lead on
          // Tuesday is not a result, and colouring it as one says it is.
          color: won && result.final ? 'var(--color-accent-300)' : undefined,
          opacity: entry ? 1 : 0.4,
        }}
      >
        {entry ? entryScore(entry) : '—'}
      </span>
    </div>
  );
}

/**
 * What happened, in a sentence.
 *
 * Four endings and they are not interchangeable: "you won" and "you won
 * because they never turned up" are different things to be told, and a screen
 * that draws them the same way is congratulating somebody on an empty lane.
 */
function Verdict({
  result,
  members,
  me,
}: {
  result: BattleResult;
  members: Member[];
  me: string;
}) {
  const nameOf = (id: string) => {
    const member = members.find((one) => one.id === id);
    if (!member) return t('Someone who left');
    return member.isMe ? t('You') : member.name.split(' ')[0];
  };

  if (!result.final) {
    if (result.waitingOn.length === 2) {
      return <p className="footnote" style={{ marginBottom: 0 }}>{t('Nobody has bowled yet.')}</p>;
    }
    if (result.waitingOn.length === 1) {
      const who = result.waitingOn[0];
      return (
        <p className="footnote" style={{ marginBottom: 0 }}>
          {who === me
            ? t('Waiting on you.')
            : tf('Waiting on {name}.', { name: nameOf(who) })}
        </p>
      );
    }
    // Both in, still open: worth saying, because it is the reason the result
    // above is not being counted on anybody's profile yet.
    return (
      <div className="note" style={{ marginTop: 8 }}>
        {t('Both games are in. Either of you can still put up a better one before it closes.')}
      </div>
    );
  }

  if (result.outcome === 'void') {
    return (
      <div className="note" style={{ marginTop: 8 }}>
        {t('It closed with nothing bowled, so nothing counts.')}
      </div>
    );
  }

  if (result.outcome === 'tied') {
    return (
      <div className="note" style={{ marginTop: 8 }}>
        {t('A tie. Nobody takes it.')}
      </div>
    );
  }

  const winner = result.winnerId ? nameOf(result.winnerId) : '';
  const isMine = result.winnerId === me;

  return (
    <div className={`note ${isMine ? 'note--good' : ''}`} style={{ marginTop: 8 }}>
      {result.outcome === 'walkover'
        ? isMine
          ? t('You take it — the other game never came in.')
          : tf('{name} takes it — the other game never came in.', { name: winner })
        : isMine
          ? t('You win it.')
          : tf('{name} wins it.', { name: winner })}
    </div>
  );
}
