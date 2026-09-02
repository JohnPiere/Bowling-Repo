import { useState } from 'react';
import { Icon } from './Icon';
import { setHeart } from '../lib/social';

/**
 * A heart on a shared game.
 *
 * The whole of the crew's reaction vocabulary, deliberately. A row of emoji
 * would need a picker, a count per emoji and a rule about what happens when
 * somebody picks three — and none of that says anything a single heart does
 * not. The schema takes an emoji column, so a second one is a change of mind
 * rather than a migration.
 *
 * Optimistic, and rolled back if the write fails: a tap that waits for a round
 * trip on alley wifi feels broken, and a heart that silently did not land is
 * worse than one that visibly bounced.
 */
export function HeartButton({
  postId,
  me,
  hearts,
  youHearted,
  onChanged,
}: {
  postId: string;
  me: string;
  hearts: number;
  youHearted: boolean;
  /** Told the new state so the list it lives in can keep its own copy right. */
  onChanged: (hearted: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !youHearted;

    setBusy(true);
    onChanged(next);
    try {
      await setHeart(postId, me, next);
    } catch {
      // Put it back. Nothing else is said: the board is still readable, and a
      // banner about a failed heart is louder than the heart was.
      onChanged(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="heart"
      aria-pressed={youHearted}
      // The count is in the label rather than beside it, because a screen
      // reader reading "heart, 3" from two adjacent nodes does not say which
      // three.
      aria-label={`${youHearted ? 'Remove your heart' : 'Heart this game'}, ${hearts} so far`}
      onClick={toggle}
    >
      <Icon name="heart" size={15} filled={youHearted} />
      {hearts > 0 && <span className="heart__count tnum">{hearts}</span>}
    </button>
  );
}
