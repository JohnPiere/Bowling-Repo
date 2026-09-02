/**
 * Screen navigation.
 *
 * A stack rather than a single current screen, because the social layer nests:
 * a group opens a member, who opens the chat, and every one of those needs a
 * back button that returns where the bowler actually came from. Tabs reset the
 * stack; everything else pushes onto it.
 */

import { useCallback, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'play' }
  | { name: 'scan' }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'auth'; then?: Route }
  | { name: 'groups' }
  | { name: 'group'; groupId: string }
  | { name: 'createGroup' }
  | { name: 'joinGroup' }
  | { name: 'groupSettings'; groupId: string }
  | { name: 'chat'; groupId: string }
  | { name: 'member'; groupId: string; memberId: string }
  | { name: 'day'; day: string }
  | { name: 'game'; gameId: string }
  | { name: 'shareGame'; gameId: string }
  | { name: 'sharedGames'; groupId: string }
  | { name: 'league'; groupId: string };

export type RouteName = Route['name'];

/** Routes reachable from the tab bar. Opening one clears the stack. */
export const TAB_ROUTES: RouteName[] = ['home', 'play', 'history', 'stats', 'groups'];

export function useNavigation(initial: Route) {
  const [stack, setStack] = useState<Route[]>([initial]);

  const route = stack[stack.length - 1];

  const push = useCallback((next: Route) => {
    setStack((current) => [...current, next]);
  }, []);

  const back = useCallback(() => {
    // Never pop the last entry: the app always has a screen.
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  /** Replace the top of the stack — for a flow that should not be re-entered. */
  const replace = useCallback((next: Route) => {
    setStack((current) => [...current.slice(0, -1), next]);
  }, []);

  /** Switch tabs, discarding whatever was stacked on the previous one. */
  const selectTab = useCallback((name: RouteName) => {
    setStack([{ name } as Route]);
  }, []);

  /** Unwind to a route already on the stack, or reset to it if it is not. */
  const returnTo = useCallback((name: RouteName) => {
    setStack((current) => {
      const index = current.findLastIndex((entry) => entry.name === name);
      return index >= 0 ? current.slice(0, index + 1) : [{ name } as Route];
    });
  }, []);

  return { route, stack, push, back, replace, selectTab, returnTo, canGoBack: stack.length > 1 };
}
