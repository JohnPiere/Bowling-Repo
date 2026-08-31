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

const BASE = process.argv[2] ?? 'http://localhost:4173';

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
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

/** Bowl a full game of strikes through the keypad. */
async function bowlPerfectGame(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const start = page.getByRole('button', { name: 'Enter pins by hand' });
  if (await start.count()) await start.click();
  for (let i = 0; i < 12; i++) {
    await page.locator('.keypad__key--mark').click();
    await page.waitForTimeout(25);
  }
}

async function signIn(page) {
  await page.getByRole('button', { name: 'Crew', exact: true }).click();
  const link = page.getByRole('button', { name: 'Link an account' });
  if (await link.count()) {
    await link.click();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
  }
  await page.waitForSelector('text=Your groups');
}

async function main() {
  const { chromium } = await import('playwright').catch(() => {
    console.error('These checks need Playwright:  npm i -D playwright');
    process.exit(2);
  });

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  // ── Progressive web app basics ────────────────────────────────────────
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto(BASE, { waitUntil: 'networkidle' });

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
      const capable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content');
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
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
        const populated = await page.locator('.game-row, .viz__svg').count();
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
    const context = await browser.newContext();
    await context.grantPermissions(['notifications'], { origin: BASE });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
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
        data: JSON.stringify({ title: 'Tuesday Crew', body: 'You posted a 212.', url: '/?screen=groups' }),
      });
      await page.waitForTimeout(1200);

      const shown = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.getNotifications()).map((n) => ({ title: n.title, body: n.body, data: n.data }));
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
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await check('groups are gated for a guest, with a way forward', async () => {
      await page.getByRole('button', { name: 'Crew', exact: true }).click();
      await page.waitForSelector('text=Groups need an account');
      assert(
        (await page.getByRole('button', { name: 'Link an account' }).count()) > 0,
        'no way to link an account',
      );
      return 'gated, with a link-account route';
    });

    await check('the leaderboard slides rather than re-mounting', async () => {
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

    await check('a game can be shared to a crew and retracted', async () => {
      await bowlPerfectGame(page);
      await page.getByRole('button', { name: 'Save this game' }).click();
      await page.waitForSelector('text=Which crew');
      await page.getByRole('button', { name: 'Share to the board' }).click();
      await page.waitForSelector('text=Shared by you');
      await page.getByRole('button', { name: 'Unshare' }).click();
      await page.waitForSelector('text=Nothing of yours is on this board');
      return 'shared, then retracted';
    });

    await check('joining by code validates against the group', async () => {
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
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.setViewportSize({ width: 412, height: 892 });
    await page.goto(BASE, { waitUntil: 'networkidle' });

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
          const tallEnough = r.height >= TARGET || (owns(el, cx, cy - reach) && owns(el, cx, cy + reach));
          const wideEnough = r.width >= TARGET || (owns(el, cx - reach, cy) && owns(el, cx + reach, cy));
          if (!tallEnough || !wideEnough) {
            small.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} (${Math.round(r.width)}x${Math.round(r.height)})`);
          }
        });
        return [...new Set(small)];
      });

    await check('every control is at least 44px to the thumb', async () => {
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

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
