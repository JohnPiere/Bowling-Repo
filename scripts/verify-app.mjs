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

    await check('the rack records which pins fell, and names the leave', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: /Tap the pins/ }).click();
      await page.waitForSelector('.rack__svg');

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
      await page.waitForSelector('.rack__svg');
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
      await page.locator('.game-row').first().click();
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
          rq.onsuccess = () => res(rq.result.map((g) => ({ total: g.total, rolls: g.rolls.length })));
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
          id: 'verify-detail', bowler: 'You', house: 'Rose Bowl Lanes',
          rolls: [10, 9, 1, 7, 2, ...Array(12).fill(4)], total: 120,
          isComplete: true, source: 'scan', hasSheet: true,
          playedAt: Date.now(), updatedAt: Date.now(),
        });
        tx.objectStore('sheets').put({ gameId: 'verify-detail', image: blob, storedAt: Date.now() });
        await new Promise((res) => { tx.oncomplete = res; });
      });

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.locator('.game-row').first().click();
      await page.waitForSelector('text=The sheet it came from');

      await page.waitForSelector('img.shot', { timeout: 10000 });
      const decoded = await page.locator('img.shot').evaluate((el) => el.complete && el.naturalWidth > 0);
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
      await page.goto(`${BASE}/?join=TCRW31`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.code-input');
      const value = await page.locator('.code-input').inputValue();
      assert(value === 'TCRW31', `the field held ${JSON.stringify(value)}`);
      await page.waitForSelector('text=invite valid');
      return 'field filled and the group matched';
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

  // ── Focus and motion ──────────────────────────────────────────────────
  {
    const context = await browser.newContext();
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });

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
      assert(after.label === 'Stats', `the screen announced itself as ${after.label}`);

      return `body on load, then <main aria-label="${after.label}">`;
    });

    await context.close();
  }

  {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage({ viewport: { width: 412, height: 892 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await check('reduced motion drops the travel but keeps the final state', async () => {
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
    });

    await context.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
