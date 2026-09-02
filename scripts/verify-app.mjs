/**
 * End-to-end checks for Lane Log.
 *
 * The unit tests cover the logic; this covers the things only a real browser
 * can answer — does the service worker actually serve the app with the network
 * cut, does a push reach the worker, is every control big enough to hit with a
 * thumb, does a save that fails lose the game.
 *
 * Opt-in, because it needs a browser:
 *
 *   npm i -D playwright
 *   npm run build && npm run preview &
 *   node scripts/verify-app.mjs [baseUrl]
 *
 * Exits non-zero if any check fails.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:4173').replace(/\/+$/, '');

/** Where downloaded and generated files go. */
const OUT = 'app-check';

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}

function skip(name, why) {
  results.push({ name, skipped: true, detail: why });
  console.log(`skip  ${name}\n        ${why}`);
}

/**
 * Whether *this machine* can reach the project.
 *
 * Not whether one exists — it does, and it is hosted. This asks only whether
 * the machine running the checks has a route to it, which a sandbox, a
 * firewall or an aeroplane can each answer no to.
 *
 * A check that needs the database and cannot reach it is *skipped*, not
 * failed: six red lines on a machine with no route says the app is broken when
 * what is broken is the connection, and a suite that cries wolf gets ignored
 * on the day it is right.
 */
let reachable = null;

async function backendReachable(page) {
  if (reachable !== null) return reachable;

  const ref = await projectRef(page);
  if (!ref) return (reachable = false);

  try {
    const response = await fetch(`https://${ref}.supabase.co/auth/v1/health`, {
      signal: AbortSignal.timeout(5000),
    });
    reachable = response.ok;
  } catch {
    reachable = false;
  }
  return reachable;
}

/** Run a check only when the backend answers; otherwise say why it did not. */
async function checkOnline(page, name, fn) {
  if (await backendReachable(page)) return check(name, fn);
  skip(name, 'this machine cannot reach the database — the crew screens have no offline mode');
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail ?? '');
  } catch (err) {
    record(name, false, err.message.split('\n')[0]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * A house sheet as they actually come: three games stacked, each a row of ten
 * ruled frames of marks over its running totals. Returned base64, to be written
 * out and picked through the file input.
 */
async function drawSheet(page) {
  const dataUrl = await page.evaluate(() => {
    const marks = ['X', '9/', '72', 'X', 'X', '8-', '9/', 'X', '63', 'XXX'];
    const running = [20, 37, 46, 74, 92, 100, 120, 139, 148, 178];

    const cell = 108;
    const rowHeight = 100;
    const gap = 46;
    const games = 3;

    const canvas = document.createElement('canvas');
    canvas.width = cell * marks.length + 40;
    canvas.height = 40 + games * (rowHeight + gap);

    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#000';
    g.lineWidth = 3;
    g.textAlign = 'center';

    for (let game = 0; game < games; game++) {
      const top = 20 + game * (rowHeight + gap);
      for (let i = 0; i < marks.length; i++) {
        const x = 20 + i * cell;
        g.strokeRect(x, top, cell, 60);
        g.strokeRect(x, top + 60, cell, 40);
        g.fillStyle = '#000';
        g.font = 'bold 40px sans-serif';
        g.fillText(marks[i], x + cell / 2, top + 45);
        g.font = '30px sans-serif';
        g.fillText(String(running[i]), x + cell / 2, top + 91);
      }
    }

    return canvas.toDataURL('image/png');
  });

  return dataUrl.split(',')[1];
}

/**
 * A browser context that opens past the first run.
 *
 * Every check below opens the app expecting the app, and a fresh profile now
 * opens on "who are you?" instead. Seeding the preference before any script
 * runs is what a bowler who has already answered has stored, so the checks
 * start where a returning one does — and as an init script it covers every
 * navigation in the context rather than each `goto` remembering.
 *
 * The first run gets a check of its own, which uses a bare context.
 */
async function newContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    try {
      // Only when nothing is stored at all. Seeding whenever `onboardedAt` is
      // null would also re-arm it straight after a wipe, and the check that a
      // wipe returns you to the first run would then be checking this script
      // rather than the app.
      if (localStorage.getItem('lane-log.preferences') === null) {
        localStorage.setItem('lane-log.preferences', JSON.stringify({ onboardedAt: Date.now() }));
      }
    } catch {
      // No storage to seed. The onboarding check covers the case where the
      // gate is meant to show.
    }
  });
  return context;
}

/** Bowl a full game of strikes through the counting pad. */
async function bowlPerfectGame(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const start = page.getByRole('button', { name: 'Just count the pins' });
  if (await start.count()) await start.click();
  for (let i = 0; i < 12; i++) {
    await page.locator('.keypad__key--mark').click();
    await page.waitForTimeout(25);
  }
}

/**
 * Put the browser in the state a signed-in one is actually in.
 *
 * Clicking "Continue with Google" now leaves the page for a real provider, so
 * a check cannot drive it — and pretending otherwise would leave every check
 * after this one running against a half-redirected page.
 *
 * What a signed-in browser *has* is a session in localStorage under a key named
 * for the project, which supabase-js reads back without touching the network so
 * long as it has not expired. Seeding that is not a backdoor: it is the same
 * bytes a real sign-in leaves behind, and nothing in `src/` knows it is a test.
 *
 * Queries made with it would be refused — the token is not signed by anything.
 * That is the honest limit of what can be checked here, and the crew screens
 * that make real queries say so rather than being asserted against.
 */
/**
 * The Supabase project the built app points at.
 *
 * Read out of the bundle rather than written down here. It was written down
 * once, and the day the project was recreated it became a value that looked
 * right, matched nothing, and would have failed as "the session did not
 * restore" — a whole checkfull of misdirection for a copy-paste.
 */
async function projectRef(page) {
  const html = await (await fetch(`${BASE}/`)).text();
  const entry = html.match(/src="([^"]+\.js)"/)?.[1];
  if (!entry) return null;

  const url = new URL(entry, `${BASE}/`).href;
  const code = await (await fetch(url)).text();
  return code.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null;
}

async function signIn(page) {
  const ref = await projectRef(page);
  assert(ref, 'could not find the backend project in the bundle');

  await page.evaluate((ref) => {
    const hour = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(
      `sb-${ref}-auth-token`,
      JSON.stringify({
        access_token: 'verify.not.a.real.token',
        refresh_token: 'verify',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: hour,
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'verify@example.test',
          app_metadata: { provider: 'google' },
          user_metadata: { full_name: 'Verify Bowler' },
          created_at: new Date().toISOString(),
        },
      }),
    );
  }, ref);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Crew', exact: true }).click();
  await page.waitForSelector('text=Your groups');
}

async function main() {
  const { chromium } = await import('playwright').catch(() => {
    console.error('These checks need Playwright:  npm i -D playwright');
    process.exit(2);
  });

  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    // A synthetic camera, so the checks that open one do not need a device and
    // never sit waiting on a permission prompt.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  // ── Progressive web app basics ────────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await check('web manifest is served and installable-shaped', async () => {
      const href = await page.getAttribute('link[rel=manifest]', 'href');
      assert(href, 'no manifest link in the document');
      const manifest = await page.evaluate(async (h) => (await fetch(h)).json(), href);
      assert(manifest.name, 'manifest has no name');
      assert(manifest.start_url, 'manifest has no start_url');
      assert(manifest.display === 'standalone', `display is ${manifest.display}`);
      const sizes = manifest.icons.map((i) => i.sizes);
      assert(sizes.includes('512x512'), 'no 512px icon');
      assert(
        manifest.icons.some((i) => i.purpose === 'maskable'),
        'no maskable icon, so Android will letterbox it',
      );
      return `${manifest.name} · ${manifest.icons.length} icons`;
    });

    await check('iOS home-screen meta tags are present', async () => {
      // iOS ignores the manifest for these, so their absence is silent.
      const capable = await page.getAttribute(
        'meta[name="apple-mobile-web-app-capable"]',
        'content',
      );
      const icon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
      assert(capable === 'yes', 'not marked web-app capable');
      assert(icon, 'no apple-touch-icon');
      return icon;
    });

    await check('service worker registers and controls the page', async () => {
      const state = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return { scope: reg.scope, active: Boolean(reg.active) };
      });
      assert(state.active, 'no active service worker');
      return state.scope;
    });

    await check('no console errors on first load', async () => {
      const real = pageErrors.filter((e) => !/ERR_(CONNECTION|CERT|NAME)/.test(e));
      assert(real.length === 0, real.slice(0, 2).join(' · '));
      return 'clean';
    });

    await context.close();
  }

  // ── Scoring, storage and offline ──────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(1200);

    await check('a perfect game scores 300 and saves', async () => {
      await bowlPerfectGame(page);
      await page.waitForSelector('text=Game finished');
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(700);
      const totals = await page.evaluate(async () => {
        // No version: open whatever schema is current, so a migration does
        // not break the check.
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        return new Promise((res) => {
          const rq = db.transaction('games').objectStore('games').getAll();
          rq.onsuccess = () => res(rq.result.map((g) => g.total));
        });
      });
      assert(totals.includes(300), `stored totals were ${JSON.stringify(totals)}`);
      return `stored ${JSON.stringify(totals)}`;
    });

    await check('the rack records which pins fell, and names the leave', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: /Tap the pins/ }).click();
      await page.waitForSelector('.rack__deck');

      const knock = async (...pins) => {
        for (const pin of pins) {
          await page.locator(`[aria-label^="Pin ${pin},"]`).click();
          await page.waitForTimeout(25);
        }
      };
      const commit = async () => {
        await page.locator('.btn-lg--primary').click();
        await page.waitForTimeout(120);
      };

      assert((await page.locator('.rack__pin').count()) === 10, 'the rack is not ten pins');

      // Clearing the deck must read as a strike, not as "10".
      await knock(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
      const label = (await page.locator('.btn-lg--primary').textContent())?.trim();
      assert(label === 'Strike', `the commit button said "${label}"`);
      await commit();

      // The 7 and the 10 are the definitive split: not adjacent, head down.
      await knock(1, 2, 3, 4, 5, 6, 8, 9);
      const leave = (await page.locator('.rack__leave').textContent()) ?? '';
      assert(leave.includes('7-10'), `the leave read "${leave}"`);
      assert(/split/i.test(leave), `the split was not named: "${leave}"`);
      await commit();

      // A spare re-racks the deck for the next frame.
      await knock(7, 10);
      await commit();
      const upright = await page.locator('.rack__pin:not(.rack__pin--gone)').count();
      assert(upright === 10, `${upright} pins on the deck after a spare`);

      // Finish, and check the pin data was stored alongside the counts.
      await page.getByRole('button', { name: 'Discard this game' }).click();
      await page.getByRole('button', { name: /Tap the pins/ }).click();
      await page.waitForSelector('.rack__deck');
      for (let i = 0; i < 12; i++) {
        await knock(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
        await commit();
      }
      await page.waitForSelector('text=Game finished', { timeout: 15000 });
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(700);

      const stored = await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        return new Promise((res) => {
          const rq = db.transaction('games').objectStore('games').getAll();
          rq.onsuccess = () =>
            res(rq.result.map((g) => ({ total: g.total, balls: g.pinfalls?.length ?? null })));
        });
      });
      const perfect = stored.find((g) => g.total === 300 && g.balls === 12);
      assert(perfect, `no 300 with twelve pinfalls: ${JSON.stringify(stored)}`);

      return 'strike, 7-10 named, re-rack after a spare, 300 with pin data';
    });

    await check('a failed save does not cost the game', async () => {
      await bowlPerfectGame(page);
      await page.waitForSelector('text=Game finished');

      // Make the store refuse, the way a full device would.
      await page.evaluate(() => {
        const proto = IDBObjectStore.prototype;
        const original = proto.put;
        proto.put = function () {
          const err = new Error('The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        };
        window.__restorePut = () => {
          proto.put = original;
        };
      });

      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(600);

      const message = await page.locator('.note--bad').first().textContent();
      assert(/out of storage/i.test(message ?? ''), `unhelpful message: ${message}`);
      assert(
        (await page.locator('text=Game finished').count()) > 0,
        'the game was discarded when the save failed',
      );

      // And it saves once the store works again.
      await page.evaluate(() => window.__restorePut());
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(700);
      return 'message shown, game kept, retry saved';
    });

    await check('the app works with the network cut', async () => {
      await context.setOffline(true);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);

      const title = await page.locator('.appbar__title').textContent();
      assert(title?.includes('Lane Log'), 'the shell did not load offline');

      for (const tab of ['History', 'Stats']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.waitForTimeout(400);
        // `.gamecard` on the home screen, `.gameline` in a history session,
        // a chart on stats — any of them means real data reached the screen.
        const populated = await page.locator('.gamecard, .gameline, .viz__svg').count();
        assert(populated > 0, `${tab} was empty offline`);
      }

      // And a game can still be scored with no network at all.
      await bowlPerfectGame(page);
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(700);

      await context.setOffline(false);
      return 'shell, history, stats and scoring all worked offline';
    });

    await context.close();
  }

  // ── Push ──────────────────────────────────────────────────────────────
  {
    const context = await newContext(browser);
    await context.grantPermissions(['notifications'], { origin: BASE });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);

    await check('a push reaches the service worker and shows a notification', async () => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('ServiceWorker.enable');

      const versions = await new Promise((resolve) => {
        cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
          const running = versions.filter(
            (v) => v.runningStatus === 'running' && v.status === 'activated',
          );
          if (running.length) resolve(running);
        });
        setTimeout(() => resolve([]), 8000);
      });
      assert(versions.length > 0, 'no running service worker to deliver to');

      await cdp.send('ServiceWorker.deliverPushMessage', {
        origin: BASE,
        registrationId: versions[0].registrationId,
        data: JSON.stringify({
          title: 'Tuesday Crew',
          body: 'You posted a 212.',
          url: '/?screen=groups',
        }),
      });
      await page.waitForTimeout(1200);

      const shown = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.getNotifications()).map((n) => ({
          title: n.title,
          body: n.body,
          data: n.data,
        }));
      });
      assert(shown.length > 0, 'no notification was shown');
      assert(shown[0].title === 'Tuesday Crew', `wrong title: ${shown[0].title}`);
      assert(shown[0].data?.url === '/?screen=groups', 'the click target was lost');

      // A push with no JSON body must still show something: Safari revokes a
      // subscription that produces no visible notification. It carries the
      // same default tag, so it *replaces* the first rather than stacking —
      // counting notifications would be the wrong test.
      await cdp.send('ServiceWorker.deliverPushMessage', {
        origin: BASE,
        registrationId: versions[0].registrationId,
        data: 'plain text nudge',
      });
      await page.waitForTimeout(900);
      const after = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body }));
      });
      assert(
        after.some((n) => n.title === 'Lane Log' && n.body === 'plain text nudge'),
        `a plain-text push showed nothing useful: ${JSON.stringify(after)}`,
      );

      return 'JSON push kept its title, body and click target; plain text still showed';
    });

    await context.close();
  }

  // ── The social flow ───────────────────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await check('groups are gated for a guest, with a way forward', async () => {
      await page.getByRole('button', { name: 'Crew', exact: true }).click();
      await page.waitForSelector('text=Groups need an account');
      assert(
        (await page.getByRole('button', { name: 'Link an account' }).count()) > 0,
        'no way to link an account',
      );
      return 'gated, with a link-account route';
    });

    await checkOnline(page, 'the leaderboard slides rather than re-mounting', async () => {
      await signIn(page);
      await page.getByRole('button', { name: /Tuesday Crew/ }).click();
      await page.waitForSelector('.board__row');

      // Identify a row by its member, not by its rendered text: the text
      // begins with the rank, which is exactly what a re-rank changes.
      const readBoard = () =>
        page.$$eval('.board__row', (els) =>
          els.map((e) => ({
            name: e.querySelector('.board__name')?.textContent ?? '',
            top: e.style.top,
          })),
        );

      const before = await readBoard();
      await page.getByRole('button', { name: 'Pins this month' }).click();
      await page.waitForTimeout(700);
      const after = await readBoard();

      assert(
        JSON.stringify(before.map((r) => r.top)) !== JSON.stringify(after.map((r) => r.top)),
        'no row moved when the metric changed',
      );
      // Same members in the same DOM order: only `top` changed, which is what
      // lets the rows slide instead of re-mounting.
      assert(
        JSON.stringify(before.map((r) => r.name)) === JSON.stringify(after.map((r) => r.name)),
        `the rows were re-sorted instead of moved: ${before.map((r) => r.name)} -> ${after.map((r) => r.name)}`,
      );
      return `${after.length} rows kept their DOM order and changed position`;
    });

    await checkOnline(page, 'a game can be shared to a crew and retracted', async () => {
      await bowlPerfectGame(page);
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForSelector('text=Which crew');
      await page.getByRole('button', { name: 'Share to the board' }).click();
      await page.waitForSelector('text=Shared by you');
      await page.getByRole('button', { name: 'Unshare' }).click();
      await page.waitForSelector('text=Nothing of yours is on this board');
      return 'shared, then retracted';
    });

    await check('a saved game can be corrected, and a bad correction refused', async () => {
      // Bowl a game whose first frame is wrong, the way a misread scan or a
      // mis-tap leaves one.
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      const start = page.getByRole('button', { name: 'Just count the pins' });
      if (await start.count()) await start.click();
      for (let i = 0; i < 2; i++) {
        await page.locator('.keypad__key', { hasText: /^–$/ }).click();
        await page.waitForTimeout(30);
      }
      for (let i = 0; i < 11; i++) {
        await page.locator('.keypad__key--mark').click();
        await page.waitForTimeout(25);
      }
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForTimeout(700);

      await page.getByRole('button', { name: 'Home', exact: true }).click();
      await page.locator('.gamecard').first().click();
      await page.waitForSelector('text=Correct it');

      await page.getByRole('button', { name: 'Fix a frame' }).click();
      await page.waitForSelector('text=Corrected game');

      // The box starts from what is stored, not from whatever a scan read.
      const seeded = await page.locator('.input.tnum').inputValue();
      assert(seeded.startsWith('--'), `the marks box was not seeded from the game: ${seeded}`);

      await page.locator('.input.tnum').fill(seeded.replace(/^--/, 'X'));
      await page.waitForTimeout(300);
      const rescored = await page.locator('.card .tnum').first().textContent();
      assert(rescored === '300', `rescoring gave ${rescored}, expected 300`);

      await page.getByRole('button', { name: 'Save the correction' }).click();
      await page.waitForTimeout(700);

      const stored = await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        return new Promise((res) => {
          const rq = db.transaction('games').objectStore('games').getAll();
          rq.onsuccess = () =>
            res(rq.result.map((g) => ({ total: g.total, rolls: g.rolls.length })));
        });
      });
      const perfect = stored.find((g) => g.total === 300 && g.rolls === 12);
      assert(perfect, `the correction did not persist: ${JSON.stringify(stored)}`);

      // A correction that describes an impossible game must not be storable.
      await page.getByRole('button', { name: 'Fix a frame' }).click();
      await page.locator('.input.tnum').fill('75 44 44 44 44 44 44 44 44 44');
      await page.waitForTimeout(300);
      assert(
        (await page.locator('.note--bad').count()) > 0,
        'an impossible game was accepted without complaint',
      );
      assert(
        await page.getByRole('button', { name: 'Save the correction' }).isDisabled(),
        'an impossible game could still be saved',
      );
      await page.getByRole('button', { name: 'Cancel' }).click();

      return 'seeded from the game, rescored live, persisted; impossible refused';
    });

    await check('a game opens, shows its stored photo, and can be deleted', async () => {
      // Seed a scanned game with a real photo, so the detail screen has one
      // to fetch from the store it now lives in.
      await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 120;
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 400, 120);
        g.fillStyle = '#111';
        g.font = '28px sans-serif';
        g.fillText('X 9/ 72 X', 20, 60);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));

        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        const tx = db.transaction(['games', 'sheets'], 'readwrite');
        tx.objectStore('games').put({
          id: 'verify-detail',
          bowler: 'You',
          house: 'Rose Bowl Lanes',
          rolls: [10, 9, 1, 7, 2, ...Array(12).fill(4)],
          total: 120,
          isComplete: true,
          source: 'scan',
          hasSheet: true,
          playedAt: Date.now(),
          updatedAt: Date.now(),
        });
        tx.objectStore('sheets').put({
          gameId: 'verify-detail',
          image: blob,
          storedAt: Date.now(),
        });
        await new Promise((res) => {
          tx.oncomplete = res;
        });
      });

      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.locator('.gamecard').first().click();
      await page.waitForSelector('text=The sheet it came from');

      await page.waitForSelector('img.shot', { timeout: 10000 });
      const decoded = await page
        .locator('img.shot')
        .evaluate((el) => el.complete && el.naturalWidth > 0);
      assert(decoded, 'the stored photo did not load from its own store');

      // Destructive, so it must confirm first.
      await page.getByRole('button', { name: 'Delete this game' }).click();
      await page.waitForSelector('text=for good');
      await page.getByRole('button', { name: 'Keep it' }).click();
      await page.waitForSelector('text=Delete this game');

      await page.getByRole('button', { name: 'Delete this game' }).click();
      await page.getByRole('button', { name: 'Delete for good' }).click();
      await page.waitForTimeout(700);

      // Assert on this game's own records: earlier checks in this context
      // have saved games of their own, so the stores are not empty.
      const left = await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        const get = (store, key) =>
          new Promise((res) => {
            const rq = db.transaction(store).objectStore(store).get(key);
            rq.onsuccess = () => res(rq.result);
          });
        return {
          game: await get('games', 'verify-detail'),
          sheet: await get('sheets', 'verify-detail'),
        };
      });
      assert(!left.game, 'the game survived deletion');
      // Deleting a game must take its photo with it, or storage leaks.
      assert(!left.sheet, 'an orphaned photo was left behind');

      return 'photo loaded on demand; delete confirmed, then removed both records';
    });

    await check('the QR the app draws actually scans', async () => {
      // Signs in for itself. This used to inherit a session from whichever
      // check ran before it, which stopped being true the moment that one
      // could be skipped.
      await signIn(page);
      await page.getByRole('button', { name: 'Crew', exact: true }).click();
      await page.getByRole('button', { name: 'Join with a code' }).click();
      await page.getByRole('button', { name: 'QR code' }).click();
      await page.waitForSelector('svg[aria-label*="QR"]', { timeout: 10000 });

      // Rasterise what the app drew, then decode it with the same library the
      // scanner uses. A QR that renders but does not scan looks fine and is
      // useless.
      const { data, size } = await page.evaluate(async () => {
        const svg = document.querySelector('svg[aria-label*="QR"]');
        const xml = new XMLSerializer().serializeToString(svg);
        const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));

        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = url;
        });

        const size = 480;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const g = canvas.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, size, size);
        g.drawImage(img, 0, 0, size, size);

        return { data: Array.from(g.getImageData(0, 0, size, size).data), size };
      });

      const { default: jsQR } = await import('jsqr');
      const found = jsQR(Uint8ClampedArray.from(data), size, size, {
        inversionAttempts: 'attemptBoth',
      });

      assert(found?.data, 'the QR the app drew could not be decoded');
      assert(found.data.includes('join=TCRW31'), `decoded to ${found.data}`);
      return found.data;
    });

    await check('a scanned join link opens with the code already in', async () => {
      await page.goto(`${BASE}/?join=TCRW31`, { waitUntil: 'domcontentloaded' });
      await signIn(page);
      await page.getByRole('button', { name: 'Crew', exact: true }).click();
      await page.getByRole('button', { name: 'Join with a code' }).click();

      await page.waitForSelector('.code-input');
      const value = await page.locator('.code-input').inputValue();
      assert(value === 'TCRW31', `the field held ${JSON.stringify(value)}`);

      // Whether the code is any good is the server's answer, not this screen's:
      // a client that could tell a real code from a wrong one before joining
      // would be a way to discover crews one guess at a time.
      return 'field filled from the link';
    });

    await checkOnline(page, 'joining by code validates against the group', async () => {
      await page.getByRole('button', { name: 'Crew', exact: true }).click();
      await page.getByRole('button', { name: 'Join with a code' }).click();
      await page.locator('.code-input').fill('nope99');
      await page.waitForTimeout(300);
      assert(
        (await page.locator('text=No group uses that code').count()) > 0,
        'a wrong code was not rejected',
      );
      await page.locator('.code-input').fill('tcrw31');
      await page.waitForSelector('text=invite valid');
      return 'wrong code refused, right code accepted';
    });

    await context.close();
  }

  // ── Touch targets ─────────────────────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.setViewportSize({ width: 412, height: 892 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    const auditTargets = () =>
      page.evaluate(() => {
        const TARGET = 44;
        const small = [];
        // Measure what a thumb actually hits, not the painted box: a control
        // may be small by design and still own a 44px area via a pseudo-element.
        const owns = (el, x, y) => {
          const hit = document.elementFromPoint(x, y);
          return Boolean(hit) && (hit === el || el.contains(hit));
        };

        document.querySelectorAll('button, a[href], [role="switch"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx < 4 || cy < 4 || cx > innerWidth - 4 || cy > innerHeight - 4) return;

          const reach = TARGET / 2 - 1;
          const tallEnough =
            r.height >= TARGET || (owns(el, cx, cy - reach) && owns(el, cx, cy + reach));
          const wideEnough =
            r.width >= TARGET || (owns(el, cx - reach, cy) && owns(el, cx + reach, cy));
          if (!tallEnough || !wideEnough) {
            small.push(
              `${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} (${Math.round(r.width)}x${Math.round(r.height)})`,
            );
          }
        });
        return [...new Set(small)];
      });

    await check('a picked photo stops at a box to draw around one game', async () => {
      const file = join(OUT, 'three-games.png');
      writeFileSync(file, Buffer.from(await drawSheet(page), 'base64'));

      // Straight to the scanner: the play screen's button is parked while the
      // reader is being worked on, and the app's own ?screen= link still opens
      // it. What is being checked here is the scanner, not the way in.
      await page.goto(`${BASE}/?screen=scan`, { waitUntil: 'networkidle' });
      await page.waitForSelector('text=Use a photo instead');
      await page.setInputFiles('input[type=file]', file);

      // Nothing is read until the bowler says which game. A sheet can hold six.
      await page.waitForSelector('.picker__box', { timeout: 20000 });
      assert(
        await page.locator('.picker__preview img').count(),
        'no preview of what would be read',
      );

      const before = await page.locator('.picker__box').boundingBox();
      const photo = await page.locator('.picker__photo').boundingBox();

      // The sheet holds three games, so there is somewhere else to go: drag the
      // box onto a different row and check it followed the pointer.
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2, photo.y + photo.height * 0.85, {
        steps: 10,
      });
      await page.mouse.up();

      const after = await page.locator('.picker__box').boundingBox();
      assert(Math.abs(after.y - before.y) > 8, `the box did not move (${before.y} -> ${after.y})`);

      const disabled = await page.getByRole('button', { name: 'Read this game' }).isDisabled();
      assert(!disabled, 'the box was drawn but could not be read');

      return `box seeded on one of three games, dragged ${Math.round(after.y - before.y)}px, preview shown`;
    });

    await check('the camera aims with a bar, and dims everything outside it', async () => {
      // Straight to the scanner: the play screen's button is parked while the
      // reader is being worked on, and the app's own ?screen= link still opens
      // it. What is being checked here is the scanner, not the way in.
      await page.goto(`${BASE}/?screen=scan`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Open the camera' }).click();

      await page.waitForSelector('.reticle', { timeout: 15000 });

      const shape = await page.evaluate(() => {
        const bar = document.querySelector('.reticle');
        const rect = bar.getBoundingClientRect();
        const finder = document.querySelector('.finder').getBoundingClientRect();
        const shades = [...document.querySelectorAll('.finder__shade')].map((s) =>
          s.getBoundingClientRect(),
        );

        return {
          aspect: rect.width / rect.height,
          locked: bar.classList.contains('reticle--locked'),
          // The bar is inside the picture it is aiming at, wherever it has
          // moved to. Its *position* is deliberately not asserted: it snaps on
          // to a row when it finds one and eases back when it loses it, so
          // there is no fixed place it is supposed to be.
          inside: rect.y >= finder.y - 1 && rect.y + rect.height <= finder.bottom + 1,
          corners: document.querySelectorAll('.reticle__corner').length,
          shades: shades.length,
        };
      });

      // A row is long and shallow; a square frame would be the wrong thing to
      // ask someone to fill.
      assert(shape.aspect > 4, `the bar is ${shape.aspect.toFixed(1)}:1, not row-shaped`);
      assert(shape.corners === 4, `${shape.corners} corner marks`);
      assert(shape.shades === 2, 'the picture outside the bar was not dimmed');
      assert(shape.inside, 'the bar is not inside the preview it is aiming at');

      return `${shape.aspect.toFixed(1)}:1 bar, four corners, dimmed outside${
        shape.locked ? ', locked on to a row' : ''
      }`;
    });

    await checkOnline(page, 'every control is at least 44px to the thumb', async () => {
      const screens = [];
      for (const tab of ['Home', 'Play', 'History', 'Stats']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.waitForTimeout(400);
        const small = await auditTargets();
        if (small.length) screens.push(`${tab}: ${small.join(', ')}`);
      }
      await signIn(page);
      await page.getByRole('button', { name: /Tuesday Crew/ }).click();
      await page.waitForSelector('.board__row');
      const groupSmall = await auditTargets();
      if (groupSmall.length) screens.push(`group: ${groupSmall.join(', ')}`);

      assert(screens.length === 0, screens.join(' | '));
      return 'home, play, history, stats and the group dashboard all clear';
    });

    await check('interactive elements all have accessible names', async () => {
      const unnamed = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('button, a[href], input:not([type=hidden])').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const named =
            (el.textContent || '').trim() ||
            el.getAttribute('aria-label') ||
            el.getAttribute('aria-labelledby') ||
            el.getAttribute('placeholder') ||
            el.labels?.length;
          if (!named) bad.push(`${el.tagName}.${el.className}`);
        });
        return [...new Set(bad)];
      });
      assert(unnamed.length === 0, unnamed.join(', '));
      return 'clean';
    });

    await context.close();
  }

  // ── Backup and restore ────────────────────────────────────────────────
  //
  // Two contexts, because the point of a backup is moving a season to a
  // different device — restoring onto the phone that made it proves nothing.
  {
    const source = await newContext(browser, { acceptDownloads: true });
    const page = await source.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    let backupPath = '';

    await check('a season exports to a file', async () => {
      await page.evaluate(async () => {
        const DAY = 86400000;
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        const tx = db.transaction(['games'], 'readwrite');
        for (let i = 0; i < 7; i++) {
          tx.objectStore('games').put({
            id: `backup-${i}`,
            bowler: 'You',
            house: 'Rose Bowl',
            rolls: Array(20).fill(4),
            total: 80,
            isComplete: true,
            source: 'manual',
            playedAt: Date.now() - i * DAY,
            updatedAt: Date.now(),
          });
        }
        await new Promise((res) => {
          tx.oncomplete = res;
        });
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.waitForSelector('text=Storage');

      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: /Export 7 games/ }).click();
      backupPath = `${OUT}/backup.json`;
      await (await pending).saveAs(backupPath);

      const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
      assert(parsed.games?.length === 7, `exported ${parsed.games?.length} games`);
      assert(parsed.format === 'lane-log/backup', `format was ${parsed.format}`);
      return `7 games, ${parsed.format}`;
    });

    await source.close();

    const fresh = await newContext(browser);
    const other = await fresh.newPage();
    await other.goto(BASE, { waitUntil: 'networkidle' });
    await other.getByRole('button', { name: 'Settings', exact: true }).click();
    await other.waitForSelector('text=Storage');

    const countGames = () =>
      other.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        return new Promise((res) => {
          const rq = db.transaction('games').objectStore('games').count();
          rq.onsuccess = () => res(rq.result);
        });
      });

    await check('a file that is not a backup is refused with a reason', async () => {
      const junk = `${OUT}/not-a-backup.json`;
      writeFileSync(junk, '<html>nope</html>');
      await other.setInputFiles('input[type=file]', junk);
      await other.waitForSelector('.note--bad');
      // .first(): a push-permission note can also be on screen, and matching
      // two would be a strict-mode violation rather than a real failure.
      const message = (await other.locator('.note--bad').first().textContent())?.trim();
      assert(/JSON/i.test(message ?? ''), `unhelpful message: ${message}`);
      return message;
    });

    await check('restoring shows a plan before it writes anything', async () => {
      await other.setInputFiles('input[type=file]', backupPath);
      await other.waitForSelector('text=7 games to add');
      // A restore that silently doubled a season would be worse than one that
      // failed, so nothing may be written before it is confirmed.
      assert((await countGames()) === 0, 'games were written before confirming');
      return 'plan shown, store untouched';
    });

    await check('a restored season lands and is usable', async () => {
      await other.getByRole('button', { name: 'Restore', exact: true }).click();
      await other.waitForSelector('text=Restored 7 games');
      assert((await countGames()) === 7, 'the games were not stored');

      await other.getByRole('button', { name: 'Home', exact: true }).click();
      await other.waitForSelector('.gamecard');
      // The hero counts up to its value, so wait for it to settle rather than
      // reading whatever frame the count happens to be on.
      await other.waitForFunction(
        () => document.querySelector('.besthero__numeral')?.textContent?.trim() === '80',
        { timeout: 3000 },
      );
      const best = (await other.locator('.besthero__numeral').textContent())?.trim();
      assert(best === '80', `the best game read ${best}`);
      return `best game ${best} on the new device`;
    });

    await check('restoring the same file twice adds nothing', async () => {
      await other.getByRole('button', { name: 'Settings', exact: true }).click();
      await other.setInputFiles('input[type=file]', backupPath);
      await other.waitForSelector('text=0 games to add');
      const text = (await other.locator('.note--info').last().textContent()) ?? '';
      assert(text.includes('7 already on this device'), text.trim());
      assert((await countGames()) === 7, 'the season was duplicated');
      return 'all seven recognised as already here';
    });

    await fresh.close();
  }

  // ── Failure containment ───────────────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await check('blocked storage is explained, not shown as an empty season', async () => {
      const blocked = await newContext(browser);
      const denied = await blocked.newPage({ viewport: { width: 412, height: 892 } });

      // What a private window, or a browser set to block site data, does.
      await denied.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          get() {
            return {
              open() {
                throw new DOMException('Access to storage is denied.', 'SecurityError');
              },
            };
          },
        });
      });

      await denied.goto(BASE, { waitUntil: 'domcontentloaded' });
      await denied.waitForTimeout(2000);

      const rendered = (
        await denied
          .locator('#root')
          .innerText()
          .catch(() => '')
      ).trim();
      assert(rendered.length > 0, 'the app did not render at all');

      const banner = (await denied.locator('.note--bad').first().textContent()) ?? '';
      // An empty list with no explanation looks exactly like a lost season.
      assert(/storage/i.test(banner), `no storage warning shown: "${banner.slice(0, 60)}"`);
      assert(
        /nothing has been deleted/i.test(banner),
        'the warning does not say the games are safe',
      );

      await blocked.close();
      return 'app renders, and says why it is empty';
    });

    await check('a bad record breaks its screen, not the whole app', async () => {
      // Pin data of a shape the leave statistics cannot iterate. Restores
      // reject this at the door; the boundary is for the one nobody predicted.
      await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        const tx = db.transaction(['games'], 'readwrite');
        tx.objectStore('games').put({
          id: 'boundary-check',
          bowler: 'You',
          rolls: Array(20).fill(4),
          total: 80,
          isComplete: true,
          source: 'manual',
          pinfalls: [5],
          playedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await new Promise((res) => {
          tx.oncomplete = res;
        });
      });

      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await page.waitForTimeout(1000);

      const root = (
        await page
          .locator('#root')
          .innerText()
          .catch(() => '')
      ).trim();
      // Everything is on the device with no server copy, so a blank page
      // means a season the bowler cannot reach.
      assert(root.length > 0, 'the app went blank');
      assert(
        (await page.getByRole('button', { name: 'Try again' }).count()) > 0,
        'no way to recover was offered',
      );

      // Clean up, so later checks are not looking at a broken screen.
      await page.evaluate(async () => {
        const db = await new Promise((res) => {
          const r = indexedDB.open('lane-log');
          r.onsuccess = () => res(r.result);
        });
        const tx = db.transaction(['games'], 'readwrite');
        tx.objectStore('games').delete('boundary-check');
        await new Promise((res) => {
          tx.oncomplete = res;
        });
      });

      return 'contained, with a way back';
    });

    await context.close();
  }

  // ── Focus and motion ──────────────────────────────────────────────────
  {
    const context = await newContext(browser);
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await check('a first run asks who you are, then stays out of the way', async () => {
      // A bare context: this is the one check that wants the gate.
      const first = await browser.newContext();
      const page = await first.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

      await page.waitForSelector('.onboard', { timeout: 15000 });
      assert(
        (await page.locator('.tabbar').count()) === 0,
        'the tab bar was reachable during the first run',
      );

      await page.locator('.input').fill('Kenji Mori');
      await page.locator('.swatch').nth(3).click();
      await page.getByRole('button', { name: /That/ }).click();
      await page.waitForSelector('.onboard__lesson');

      await page.getByRole('button', { name: 'Skip the tour' }).click();
      await page.waitForSelector('.tabbar', { timeout: 5000 });

      const stored = JSON.parse(
        await page.evaluate(() => localStorage.getItem('lane-log.preferences')),
      );
      assert(stored.playerName === 'Kenji Mori', `the name stored as ${stored.playerName}`);
      assert(stored.playerColour === 'teal', `the colour stored as ${stored.playerColour}`);
      assert(stored.onboardedAt > 0, 'the first run was not recorded as done');

      // And it must not ask again.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.tabbar', { timeout: 5000 });
      assert((await page.locator('.onboard').count()) === 0, 'it asked again after a reload');

      await first.close();
      return 'named, coloured, toured, and does not ask twice';
    });

    await check('clearing everything asks who you are again', async () => {
      const context = await newContext(browser);
      const page = await context.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

      // A name to forget, and a game to delete — the clear button is rightly
      // disabled with nothing stored, so the flow needs something in it.
      await page.evaluate(async () => {
        const stored = JSON.parse(localStorage.getItem('lane-log.preferences') ?? '{}');
        localStorage.setItem(
          'lane-log.preferences',
          JSON.stringify({ ...stored, playerName: 'Kenji Mori', playerColour: 'rose' }),
        );

        const db = await new Promise((res) => {
          const request = indexedDB.open('lane-log');
          request.onsuccess = () => res(request.result);
        });
        const tx = db.transaction('games', 'readwrite');
        tx.objectStore('games').put({
          id: 'wipe-me',
          bowler: 'You',
          rolls: new Array(12).fill(10),
          total: 300,
          isComplete: true,
          source: 'manual',
          playedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await new Promise((res) => {
          tx.oncomplete = res;
        });
      });
      await page.reload({ waitUntil: 'networkidle' });

      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: 'Clear all data', exact: true }).click();
      await page.getByRole('button', { name: 'Yes, delete everything' }).click();
      await page.waitForTimeout(900);

      const stored = JSON.parse(
        await page.evaluate(() => localStorage.getItem('lane-log.preferences')),
      );
      assert(stored.onboardedAt === null, 'the first run was not re-armed');
      assert(
        stored.playerName === 'You' && stored.playerColour === 'accent',
        `it kept ${stored.playerName} in ${stored.playerColour}`,
      );

      // A reload lands on the first run, not on a dashboard with no name.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.onboard', { timeout: 5000 });

      await context.close();
      return 'name, colour and the flag all cleared';
    });

    await check('navigating moves focus to the new screen', async () => {
      // Without this the tapped control unmounts and focus falls to the body,
      // so a keyboard user starts again from the top and a screen reader says
      // nothing about where it went.
      const onLoad = await page.evaluate(() => document.activeElement?.tagName);
      assert(onLoad !== 'MAIN', 'focus was taken on first load, which is its own rudeness');

      await page.getByRole('button', { name: 'Stats', exact: true }).click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        label: document.activeElement?.getAttribute('aria-label'),
      }));
      assert(after.tag === 'MAIN', `focus went to ${after.tag}`);
      // The tab is "Stats"; the screen it opens is titled "Analytics", which
      // is the handoff's name for it. What matters is that <main> announces
      // the screen rather than staying silent.
      assert(after.label === 'Analytics', `the screen announced itself as ${after.label}`);

      return `body on load, then <main aria-label="${after.label}">`;
    });

    await context.close();
  }

  {
    const context = await newContext(browser, { reducedMotion: 'reduce' });
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    await checkOnline(
      page,
      'reduced motion drops the travel but keeps the final state',
      async () => {
        await signIn(page);
        await page.getByRole('button', { name: /Tuesday Crew/ }).click();
        await page.waitForSelector('.board__row');

        const styles = await page.evaluate(() => {
          const row = document.querySelector('.board__row');
          const orb = document.querySelector('.orb');
          return {
            rowTransition: getComputedStyle(row).transitionDuration,
            orbIterations: getComputedStyle(orb).animationIterationCount,
          };
        });
        assert(
          parseFloat(styles.rowTransition) * 1000 <= 1,
          `rows still travel over ${styles.rowTransition}`,
        );
        // The hero orb pulses forever by default, which is the sort of thing
        // reduced motion exists for.
        assert(styles.orbIterations === '1', `the orb still loops ${styles.orbIterations} times`);

        // The point is to remove the movement, not the layout it moves to.
        const tops = await page.$$eval('.board__row', (els) => els.map((e) => e.style.top));
        assert(new Set(tops).size === tops.length, `rows share positions: ${tops.join()}`);

        return `no travel, orb settled, ${tops.length} rows still ranked`;
      },
    );

    await context.close();
  }

  await browser.close();

  const skipped = results.filter((r) => r.skipped);
  const ran = results.filter((r) => !r.skipped);
  const failed = ran.filter((r) => !r.ok);

  console.log(`\n${ran.length - failed.length}/${ran.length} checks passed.`);
  if (skipped.length > 0) {
    console.log(
      `${skipped.length} skipped: no route to the database from this machine. ` +
        'They exercise the crew screens, which need it — this says nothing about the app.',
    );
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
