/**
 * Getting out of a build that has moved under an open page.
 *
 * This app is served from GitHub Pages, where a deploy replaces every hashed
 * filename and deletes the old ones. A phone that has the service worker
 * installed keeps being served the *precached* shell, which names files the
 * server no longer has — and because updates sit behind a prompt the app itself
 * has to draw, a shell that cannot load is a shell that can never ask.
 *
 * Two symptoms come out of that, and both were reported before this existed: a
 * white page on a phone that had visited before, and a "Continue with Google"
 * button that did nothing, because the Supabase chunk is deliberately not
 * precached and so 404s for a client still on the old shell.
 *
 * The way out is the same in both cases and it is not subtle: drop the service
 * worker and every cache it holds, then reload. Nothing here touches IndexedDB,
 * which is where the games are — this clears the copy of the *program*, not the
 * copy of the season.
 *
 * `index.html` carries a second, smaller version of this that runs when the
 * bundle never arrives at all. That one cannot import anything, so the two are
 * deliberately separate rather than shared.
 */

/** Unregister every worker and delete every cache. Resolves either way. */
export async function clearAppCaches(): Promise<void> {
  const jobs: Promise<unknown>[] = [];

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.getRegistrations) {
    jobs.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .catch(() => undefined),
    );
  }

  if (typeof caches !== 'undefined') {
    jobs.push(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined),
    );
  }

  await Promise.all(jobs);
}

/**
 * Clear the caches and reload.
 *
 * Never resolves in the ordinary case, because the page goes away. The timeout
 * is there so a browser that will not answer either question still reloads: a
 * reload that did not happen leaves somebody exactly where they were stuck.
 */
export async function reloadClean(): Promise<void> {
  await Promise.race([clearAppCaches(), new Promise((done) => setTimeout(done, 4000))]);
  window.location.reload();
}
