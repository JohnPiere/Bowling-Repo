/**
 * The one connection to the outside.
 *
 * Lane Log is local-first and stays that way: scoring, scanning, history and
 * analytics all run against IndexedDB with no account and no network. This
 * module exists only for the part that is inherently shared — who you are,
 * which crews you are in, and what was said in them.
 *
 * ## The key in this file is public, and that is not a mistake
 *
 * A single-page app served from static hosting has no server to keep a secret
 * in: whatever key it uses to reach the database is in the JavaScript bundle,
 * readable by anybody who opens the network tab. Supabase is built for that —
 * the publishable key identifies the *project*, not the caller, and grants
 * nothing on its own.
 *
 * What actually decides who may read a crew's chat is the row-level security
 * policies in `supabase/migrations/0001_social.sql`, evaluated by Postgres
 * against the signed-in user on every single query. So the policies are the
 * security review; this constant is an address.
 *
 * Two things follow that are worth writing down:
 *
 *   - Never put the `service_role` key or the database password anywhere near
 *     this file. Those *do* grant everything and bypass RLS entirely.
 *   - A new table is unreachable until it has policies. Postgres denies by
 *     default once RLS is on, which is the right way round — a table nobody
 *     wrote a policy for fails closed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Overridable so a fork can point at its own project without editing source.
 * The fallbacks are this app's own, and are public for the reasons above.
 */
export const BACKEND_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://kbfzyfbwnwpntiknhyjc.supabase.co';

export const BACKEND_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_1PN8HGodUwS5J_ybW4Vfcg__UIUAoK7';

/** False in a fork that has stripped the defaults and set nothing. */
export function isBackendConfigured(): boolean {
  return Boolean(BACKEND_URL && BACKEND_KEY);
}

let client: Promise<SupabaseClient> | null = null;

/**
 * The client, made once, and *imported* once.
 *
 * The dynamic import is the point of this shape. The SDK is 66 KB gzipped on
 * top of everything else, and the app it is bolted onto is a scoring app that
 * works with no account at all — so a bowler who never opens the crew tab
 * should never download it. Vite splits it into its own chunk on the strength
 * of this `import()`, and `hasStoredSession()` below means a guest does not
 * even fetch that chunk to find out they are a guest.
 *
 * Every caller is already async, so the promise costs nothing at the call site.
 */
export function backend(): Promise<SupabaseClient> {
  if (client) return client;

  client = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(BACKEND_URL, BACKEND_KEY, {
      auth: {
        // PKCE rather than the implicit flow. There is no server to hold a client
        // secret, so the code-plus-verifier exchange is the only one of the two
        // that does not put an access token in a URL — which on a phone means in
        // the history, and in whatever the share sheet copies.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // The redirect comes back with `?code=`, which this swaps for a session
        // and then strips out of the address bar.
        detectSessionInUrl: true,
      },
      realtime: {
        // The chat is the only subscription. Ten a second is far more than a
        // conversation needs and keeps a burst from waking the screen repeatedly.
        params: { eventsPerSecond: 10 },
      },
    }),
  );

  return client;
}

/**
 * Whether this device has a session worth restoring.
 *
 * Supabase keeps its token under a key named for the project, so its presence
 * answers "is anybody signed in here" without loading the SDK to ask. A guest
 * — which is most opens, and every first open — therefore skips the import
 * entirely rather than downloading it to be told no.
 *
 * A false positive costs one wasted import; a false negative would show a
 * signed-in bowler the sign-in card, so this errs towards loading.
 */
export function hasStoredSession(): boolean {
  try {
    const ref = new URL(BACKEND_URL).hostname.split('.')[0];
    return localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    // No storage to read, so nothing was stored.
    return false;
  }
}

/**
 * Where the OAuth provider sends the bowler back to.
 *
 * Must be the full URL *including* the base path, because a GitHub Pages
 * project site serves the app from a subdirectory — sending them to the origin
 * lands on somebody else's page. This exact string also has to be listed under
 * Authentication → URL Configuration → Redirect URLs, or Supabase refuses the
 * redirect rather than following it.
 */
export function redirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/**
 * Turn whatever came back into a sentence a bowler can act on.
 *
 * Supabase reports a network failure and a policy denial in the same shape, and
 * the difference matters: one is worth retrying in a minute and the other never
 * will be. A paused free-tier project — which is what a week of not bowling
 * gets you — arrives as a network failure, so it is named here rather than
 * left as "something went wrong".
 */
export function describeBackendFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Cannot reach the server. Your games are safe on this device — only the crew screens need a connection.';
  }
  if (/JWT|token is expired|invalid claim/i.test(message)) {
    return 'That session has expired. Sign in again to reach your crews.';
  }
  if (/row-level security|violates row-level/i.test(message)) {
    return 'You are not in that crew, so there is nothing to show.';
  }
  if (/No crew uses that code/i.test(message)) {
    return 'No crew uses that code. Check it against the message you were sent — codes expire after 14 days.';
  }
  return message || 'Something went wrong reaching the server.';
}

/**
 * Which sign-in providers the project actually has switched on.
 *
 * Worth a request because of how `signInWithOAuth` fails. It does not ask the
 * server anything — it builds an `/authorize` URL and sets `location.href` — so
 * a provider that is switched off is not an error the app can catch. The
 * browser leaves, and Supabase answers the navigation with
 * `{"error_code":"validation_failed","msg":"Unsupported provider: provider is
 * not enabled"}` as a bare JSON page. The bowler is then looking at a stack
 * trace's worth of nothing, on a different origin, with no way back but the
 * back button.
 *
 * `/auth/v1/settings` is public, unauthenticated and small, and answers the one
 * question that avoids all of that.
 */
let providers: Promise<Record<string, boolean> | null> | null = null;

export function enabledProviders(): Promise<Record<string, boolean> | null> {
  if (providers) return providers;

  providers = fetch(`${BACKEND_URL}/auth/v1/settings`, {
    headers: { apikey: BACKEND_KEY },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { external?: Record<string, boolean> } | null) => body?.external ?? null)
    .catch(() => null);

  return providers;
}

/**
 * Why this provider cannot be used, or null if it can.
 *
 * `external` being null means the question could not be asked — an unreachable
 * server, or a paused project. That is deliberately *not* a refusal: blocking
 * sign-in because a pre-flight check failed would turn one flaky request into a
 * locked door, and the redirect itself will report the real problem.
 */
export function providerUnavailable(
  provider: 'google',
  external: Record<string, boolean> | null,
): string | null {
  if (external === null) return null;
  if (external[provider]) return null;

  return 'Google sign-in is not switched on for this project yet. Switch it on in the Supabase dashboard under Authentication → Sign In / Providers.';
}
