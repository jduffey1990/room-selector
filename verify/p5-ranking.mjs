/**
 * P5.4 — drag to rank.
 *
 * Emulator-only, like the other local harnesses: it needs a trip to render
 * but never submits, so nothing here touches production or sends mail.
 *
 * What this is actually guarding against. The ranked order is the ballot; a
 * reorder control that silently drops or duplicates an entry produces a
 * ballot that does not say what the person meant, and the allocator then
 * fairly allocates fiction. Every check below asserts the *resulting order*
 * rather than that a control was clickable -- "the drag ran" is not the
 * property that matters.
 *
 * Three input paths are checked because each covers a case the others miss:
 * pointer drag (mouse and thumb), arrow keys (keyboard and screen reader),
 * and the up/down buttons (precise, and what the trip e2e drives).
 *
 *   firebase emulators:start --only auth,firestore,functions
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed-demo-trips.js
 *   VITE_USE_EMULATOR=true VITE_AUTH_EMULATOR=true npm run dev -- --port 5173
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/p5-ranking.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import admin from 'firebase-admin';

// localhost, not 127.0.0.1: vite binds the hostname it prints, which resolves
// to ::1 here, and the numeric form is refused.
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TRIP_NAME = '[demo] Breckenridge Ski Week';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: set FIRESTORE_EMULATOR_HOST (emulator-only harness).');
  process.exit(1);
}

admin.initializeApp({ projectId: 'room-selector' });
const db = admin.firestore();

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok' : 'FAIL'}: ${what}`);
  if (!ok) failures++;
};

const tripsSnap = await db.collection('trips').get();
const trip = tripsSnap.docs.find((d) => (d.data().name || '') === TRIP_NAME);
if (!trip) {
  console.error(`Missing "${TRIP_NAME}". Run: node seed/seed-demo-trips.js`);
  process.exit(1);
}

const consoleErrors = [];
const suppressed = [];

/**
 * Same narrow allowlist as verify/e2e-napa-flow.mjs, and narrow for the same
 * reason: the zero-console-errors gate is the most valuable assertion here,
 * because every production bug in this repo so far returned HTTP 200 and
 * logged nothing. Widening it to quiet a failure removes the thing that
 * catches them.
 *
 * `requestStorageAccess: Permission denied` is the reCAPTCHA iframe App Check
 * loads; headless Chromium refuses third-party storage access. If it ever
 * shows up in a real browser, delete this and treat it as a bug.
 *
 * Note what is deliberately NOT listed: the 403 from
 * content-firebaseappcheck.googleapis.com. That one means the App Check token
 * exchange genuinely failed, and the fix is a registered debug token (below),
 * not a wider filter -- "Failed to load resource: 403" is also exactly what a
 * broken callable prints.
 */
const isHeadlessArtifact = (text) =>
  text.includes('requestStorageAccess: Permission denied');

/**
 * App Check rejects headless reCAPTCHA, so without a registered debug token
 * the exchange 403s and the run fails on console errors it cannot fix.
 *
 * Read from the environment, or from a gitignored .env.local, and injected
 * into the page before any script runs. Deliberately NOT a `VITE_` variable:
 * Vite inlines those into the production bundle at build time, and a debug
 * token shipped to every visitor is an App Check bypass for anyone who reads
 * the JS. Unprefixed, Vite loads it for its own process and never emits it.
 */
function readDebugToken() {
  if (process.env.APPCHECK_DEBUG_TOKEN) return process.env.APPCHECK_DEBUG_TOKEN;
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('APPCHECK_DEBUG_TOKEN='));
    return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const DEBUG_TOKEN = readDebugToken();
if (!DEBUG_TOKEN) {
  console.warn(
    'APPCHECK_DEBUG_TOKEN not set — App Check will 403 and this run will ' +
    'report console errors it cannot avoid. Register a debug token and put ' +
    'it in .env.local (unprefixed).'
  );
}

const browser = await chromium.launch();

/** The bed names currently in the ranked list, top to bottom. */
const order = (page) =>
  page.$$eval('[data-testid="ranked-row"]', (rows) =>
    rows.map((r) => r.querySelectorAll('span')[1].textContent.trim())
  );

async function runAt(label, viewport, hasTouch) {
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}), dark mode`);
  const context = await browser.newContext({ colorScheme: 'dark', viewport, hasTouch });
  if (DEBUG_TOKEN) {
    // Before any page script, so App Check sees it at initialization.
    await context.addInitScript((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, DEBUG_TOKEN);
  }
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    (isHeadlessArtifact(m.text()) ? suppressed : consoleErrors).push({ label, text: m.text() });
  });
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message}` }));

  await page.goto(`${BASE}/#/trip/${trip.id}`);
  await page.waitForSelector('[data-testid="room-card"]');

  // Nothing ranked yet: the list must not render an empty shell.
  check(
    (await page.locator('[data-testid="ranked-list"]').count()) === 0,
    'ranked list is absent until something is ranked'
  );

  // Rank the first four beds, in the order the cards appear.
  const cards = page.locator('[data-testid="room-card"]');
  const picked = [];
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i);
    picked.push((await card.locator('h3').textContent()).trim());
    await card.locator('button:text-is("Add to Preferences")').click();
  }
  await page.waitForSelector('[data-testid="ranked-list"]');

  let seen = await order(page);
  check(
    JSON.stringify(seen) === JSON.stringify(picked),
    `ranking mirrors the order beds were added (${seen.length} rows)`
  );

  // --- pointer drag: row 0 down two places ------------------------------
  // Measured, not assumed -- row height differs between 390px and desktop
  // because long bed names wrap, and the component derives its own pitch the
  // same way. A hardcoded offset here would pass for the wrong reason.
  const pitch = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="ranked-list"]');
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    return list.firstElementChild.offsetHeight + gap;
  });

  const grip = page.locator('[data-testid="ranked-row"]').first().locator('button').first();
  // Scroll first, then measure. Ranking four beds scrolls the page down to
  // each card, which leaves this list above the fold -- boundingBox() then
  // reports a negative y, page.mouse dispatches at coordinates outside the
  // viewport, and every event lands on <html>. The drag silently does nothing
  // and the component gets blamed for a defect in the harness.
  await grip.scrollIntoViewIfNeeded();
  const box = await grip.boundingBox();
  if (!box || box.y < 0) throw new Error(`grip is off-viewport (y=${box?.y}) — cannot drag`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Two intermediate moves: one sample would still pass if the component
  // only read the final position, which is not how a real drag behaves.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + pitch);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + pitch * 2);
  await page.mouse.up();

  const afterDrag = await order(page);
  const wantDrag = [picked[1], picked[2], picked[0], picked[3]];
  check(
    JSON.stringify(afterDrag) === JSON.stringify(wantDrag),
    `drag moved rank 1 to rank 3 (got ${afterDrag.map((n) => n.slice(0, 14)).join(' | ')})`
  );
  check(
    new Set(afterDrag).size === 4 && afterDrag.length === 4,
    'drag preserved every entry — none dropped, none duplicated'
  );

  // Each remaining check derives its expectation from the order observed
  // immediately before it acts, never from what an earlier step was supposed
  // to produce. The first version chained off `wantDrag`, so one real drag bug
  // reported itself twice and the keyboard path looked broken when it wasn't.

  // --- keyboard: focus a grip and move it up ----------------------------
  const beforeKey = await order(page);
  await page.locator('[data-testid="ranked-row"]').nth(2).locator('button').first().focus();
  await page.keyboard.press('ArrowUp');
  const afterKey = await order(page);
  check(
    afterKey[1] === beforeKey[2] && afterKey[2] === beforeKey[1],
    'ArrowUp on a focused grip moves that bed up one place'
  );

  // --- buttons: the fallback the e2e harness drives ---------------------
  const beforeButton = await order(page);
  await page.locator('[data-testid="ranked-row"]').first()
    .locator('button[aria-label^="Move"][aria-label$="down"]').click();
  const afterButton = await order(page);
  check(
    afterButton[0] === beforeButton[1] && afterButton[1] === beforeButton[0],
    'the down button still reorders (chevron fallback intact)'
  );

  // Boundaries: nothing should let an edge row leave the list.
  check(
    await page.locator('[data-testid="ranked-row"]').first()
      .locator('button[aria-label$="up"]').isDisabled(),
    'up is disabled on the first row'
  );
  check(
    await page.locator('[data-testid="ranked-row"]').last()
      .locator('button[aria-label$="down"]').isDisabled(),
    'down is disabled on the last row'
  );

  // --- remove round-trips to the bed card -------------------------------
  const removing = afterButton[0];
  await page.locator('[data-testid="ranked-row"]').first()
    .locator('button[aria-label^="Remove"]').click();
  const afterRemove = await order(page);
  check(
    afterRemove.length === 3 && !afterRemove.includes(removing),
    'remove drops exactly that bed from the ranking'
  );
  check(
    (await page
      .locator(`[data-testid="room-card"]:has(h3:text-is("${removing}"))`)
      .locator('button:text-is("Add to Preferences")')
      .count()) === 1,
    'the removed bed offers "Add to Preferences" again'
  );

  // Emptying the list must take the panel away with it.
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-testid="ranked-row"]').first()
      .locator('button[aria-label^="Remove"]').click();
  }
  check(
    (await page.locator('[data-testid="ranked-list"]').count()) === 0,
    'the panel disappears again when nothing is ranked'
  );

  await context.close();
}

await runAt('mobile', { width: 390, height: 844 }, true);
await runAt('desktop', { width: 1280, height: 900 }, false);

await browser.close();

console.log('\n=== console errors');
check(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length})`);
for (const e of consoleErrors) console.log(`   [${e.label}] ${e.text}`);
// Printed, not hidden: a suppression nobody can see is a suppression nobody
// re-examines when the count quietly changes.
console.log(`   (${suppressed.length} known headless artifact(s) suppressed)`);
for (const e of suppressed) console.log(`   ~ [${e.label}] ${e.text}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
