/**
 * Loading crews, for the screens that draw them.
 *
 * Three states, and every screen using these has to draw all three: waiting,
 * broken, and here. Not a nicety — the crew screens are the only part of this
 * app that can fail for reasons outside the phone, and an app that shows a
 * blank list when it means "the server did not answer" is lying about your
 * crew being empty.
 */

import { useCallback, useEffect, useState } from 'react';
import { describeBackendFailure } from './backend';
import { listGroups, loadGroup, type Group } from './social';
import type { Session } from './session';

export interface Loaded<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Every crew you are in.
 *
 * A guest fetches nothing and is not an error: the crew tab has its own
 * sign-in gate, and asking the server about somebody with no account would
 * only produce an empty list and a wasted request.
 */
export function useCrews(session: Session): Loaded<Group[]> {
  const [data, setData] = useState<Group[]>([]);
  const [loading, setLoading] = useState(!session.isGuest);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (session.isGuest) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    let live = true;
    setLoading(true);
    setError(null);

    listGroups(session.id)
      .then((groups) => {
        if (live) setData(groups);
      })
      .catch((err) => {
        // Keep whatever was already on screen. A refresh that fails should not
        // wipe the crew you were looking at a second ago.
        if (live) setError(describeBackendFailure(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [session.id, session.isGuest, attempt]);

  return { data, loading, error, reload };
}

/** One crew, with its roster and the games behind its board. */
export function useCrew(groupId: string, session: Session): Loaded<Group | null> {
  const [data, setData] = useState<Group | null>(null);
  const [loading, setLoading] = useState(!session.isGuest);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (session.isGuest) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let live = true;
    setLoading(true);
    setError(null);

    loadGroup(groupId, session.id)
      .then((group) => {
        if (live) setData(group);
      })
      .catch((err) => {
        if (live) setError(describeBackendFailure(err));
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, [groupId, session.id, session.isGuest, attempt]);

  return { data, loading, error, reload };
}
