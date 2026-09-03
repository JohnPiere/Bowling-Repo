import { useEffect, useRef } from 'react';
import { raise, type AlertContext } from './alerts';
import { scoreGame } from './scoring';
import { watchMessages, watchSharedGames, type Group } from './social';

/**
 * Listen to every crew, from wherever the bowler happens to be.
 *
 * Subscribed at the top of the app rather than on the chat screen, which is
 * the point: a notification about the conversation you already have open is
 * worth nothing, and the one about the crew you are *not* looking at is the
 * whole feature. The chat screen keeps its own subscription for drawing
 * messages; this one is only ever for telling.
 *
 * Nothing here runs for a guest — there are no crews — and nothing runs
 * without permission, because `alert` checks before it shows and a socket per
 * crew is not worth opening to throw the results away.
 */
export function useCrewAlerts(crews: Group[], me: string, context: AlertContext): void {
  // Held in a ref so a change of screen does not tear down and re-open every
  // socket: the rules read the *current* context at the moment something
  // arrives, which is what they are about.
  const latest = useRef(context);
  latest.current = context;

  // Same for the roster, so a crew's unread count changing does not reconnect.
  const names = useRef(new Map<string, string>());
  names.current = new Map(crews.map((crew) => [crew.id, crew.name]));

  const ids = crews.map((crew) => crew.id).join(',');

  useEffect(() => {
    if (!me || ids === '') return;

    const stops = ids.split(',').map((groupId) => {
      const stopMessages = watchMessages(groupId, (row) => {
        void raise(
          {
            groupId,
            groupName: names.current.get(groupId) ?? 'Lane Log',
            authorId: row.author_id,
            kind: 'message',
            detail: row.body,
          },
          me,
          latest.current,
        );
      });

      const stopGames = watchSharedGames(groupId, (row) => {
        void raise(
          {
            groupId,
            groupName: names.current.get(groupId) ?? 'Lane Log',
            authorId: row.profile_id,
            kind: 'game',
            // The score, rescored from the rolls rather than trusted: the row
            // carries a total and everything else in the app recomputes it.
            detail: `${scoreGame(row.rolls).total}`,
          },
          me,
          latest.current,
        );
      });

      return () => {
        stopMessages();
        stopGames();
      };
    });

    return () => {
      for (const stop of stops) stop();
    };
  }, [ids, me]);
}
