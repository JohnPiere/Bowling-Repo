import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { t, tf } from '../lib/i18n';
import type { Game } from '../lib/db';
import {
  GOAL_METRICS,
  describeGoal,
  goalProgress,
  loadGoals,
  newGoalId,
  problemWithGoal,
  saveGoals,
  specFor,
  type Goal,
  type GoalMetric,
  type GoalWindow,
} from '../lib/goals';

interface Props {
  games: Game[];
}

const WINDOWS: { key: GoalWindow; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

/**
 * What you are trying to do.
 *
 * Private, on this device, counting every game whether or not the crew ever
 * sees it — which is the whole difference from a challenge and the reason the
 * two are not one screen with a switch on it.
 *
 * A `reach` goal draws a bar because a bar is what it is. A `hold` goal draws
 * where you are against where you said, and its bar is a *distance* rather than
 * an accumulation — "62% of the way to an average of 180" is not a sentence, so
 * the number beside it is the average itself and the bar is only ever a hint.
 */
export function Goals({ games }: Props) {
  const [goals, setGoals] = useState<Goal[]>(loadGoals);
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<GoalMetric>('strikes');
  const [target, setTarget] = useState('50');
  const [window, setWindow] = useState<GoalWindow>('month');
  const [failed, setFailed] = useState(false);

  const progress = useMemo(() => goals.map((goal) => goalProgress(goal, games)), [goals, games]);
  const problem = adding ? problemWithGoal({ metric, target: Number(target) }) : null;

  function commit(next: Goal[]) {
    setGoals(next);
    // Says whether the write stuck, like `savePreferences`: a goal that
    // silently did not save is one somebody thinks they set.
    setFailed(!saveGoals(next));
  }

  function add() {
    commit([
      ...goals,
      {
        id: newGoalId(),
        name: '',
        metric,
        target: Math.round(Number(target)),
        window,
        createdAt: Date.now(),
      },
    ]);
    setAdding(false);
  }

  function pick(next: GoalMetric) {
    setMetric(next);
    // The target follows the metric, because 50 is a sane number of strikes
    // and a nonsensical average.
    setTarget(String(specFor(next).suggested));
  }

  return (
    <div className="card">
      {progress.length === 0 && !adding && (
        <p className="muted" style={{ margin: '0 0 11px' }}>
          {t('Nothing set. A goal is yours alone — it counts every game, shared or not.')}
        </p>
      )}

      {progress.map((one) => {
        return (
          <div key={one.goal.id} className="leave-row">
            <span className="grow">
              <span style={{ display: 'block', fontSize: 13 }}>
                {describeGoal(one.goal)}
                {one.met && ' ★'}
              </span>
              <span className="muted tnum">
                {one.games === 0
                  ? t('nothing bowled yet')
                  : one.kind === 'reach'
                    ? tf('{value} of {target}', { value: one.value, target: one.goal.target })
                    : tf('at {value}', { value: one.value })}
                {' · '}
                {t(WINDOWS.find((w) => w.key === one.goal.window)?.label ?? '')}
              </span>
            </span>
            <span className="leave-row__bar">
              <span
                className="leave-row__fill"
                style={{ width: `${Math.max(2, one.percent)}%` }}
              />
            </span>
            <button
              type="button"
              className="iconbtn"
              aria-label={tf('Drop {goal}', { goal: describeGoal(one.goal) })}
              onClick={() => commit(goals.filter((goal) => goal.id !== one.goal.id))}
            >
              {/* No `close` in the icon set, and `plus` turned 45 degrees is
                  the same two strokes — a second path to keep in step would
                  buy nothing. */}
              <Icon name="plus" size={15} className="icon--close" />
            </button>
          </div>
        );
      })}

      {failed && (
        <div className="note note--bad" style={{ marginTop: 11 }}>
          {t('That could not be saved on this device, so it will not survive a reload.')}
        </div>
      )}

      {adding ? (
        <>
          <div className="chips" role="group" aria-label={t('Goal')} style={{ marginTop: 11 }}>
            {GOAL_METRICS.map((spec) => (
              <button
                key={spec.key}
                type="button"
                className="chip"
                aria-pressed={metric === spec.key}
                onClick={() => pick(spec.key)}
              >
                {t(spec.label)}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 11, margin: '11px 0' }}>
            <label className="grow">
              <span className="hero__label">{t('Target')}</span>
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
          </div>

          <div className="chips" role="group" aria-label={t('Over')}>
            {WINDOWS.map((one) => (
              <button
                key={one.key}
                type="button"
                className="chip"
                aria-pressed={window === one.key}
                onClick={() => setWindow(one.key)}
              >
                {t(one.label)}
              </button>
            ))}
          </div>

          {problem && (
            <div className="note note--bad" style={{ marginTop: 11 }}>
              {problem}
            </div>
          )}

          <button
            type="button"
            className="btn-lg btn-lg--primary"
            style={{ marginTop: 11 }}
            disabled={problem !== null}
            onClick={add}
          >
            {t('Set it')}
          </button>
          <button
            type="button"
            className="btn-lg"
            style={{ marginTop: 11 }}
            onClick={() => setAdding(false)}
          >
            {t('Cancel')}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn-lg"
          style={{ marginTop: progress.length ? 11 : 0 }}
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" size={18} />
          {t('Set a goal')}
        </button>
      )}
    </div>
  );
}
