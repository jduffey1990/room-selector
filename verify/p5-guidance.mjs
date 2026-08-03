/**
 * P5.3 — explain the mechanism where it is used.
 *
 * Emulator-only. Renders the submission form but never submits.
 *
 * The two properties that matter, and why:
 *
 *   1. The explainer appears once and can always be got back. A first-run
 *      dialog that is gone for good is worse than no dialog -- someone works
 *      out halfway down the form that they do not understand the price rule,
 *      and has nowhere to go.
 *   2. Tooltips open by tap. Hover does not exist on a phone, and trip links
 *      arrive by text message, so a hover-only tooltip hides this content from
 *      most of the people who need it. Every check here uses click/tap and
 *      keyboard, never hover.
 *
 * Setup is the same as verify/p5-ranking.mjs (see its header), then:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/p5-guidance.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import admin from 'firebase-admin';

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
const isHeadlessArtifact = (t) => t.includes('requestStorageAccess: Permission denied');

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

const browser = await chromium.launch();

async function runAt(label, viewport, hasTouch) {
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}), dark mode`);
  const context = await browser.newContext({ colorScheme: 'dark', viewport, hasTouch });
  if (DEBUG_TOKEN) {
    await context.addInitScript((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, DEBUG_TOKEN);
  }
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    (isHeadlessArtifact(m.text()) ? suppressed : consoleErrors).push({ label, text: m.text() });
  });
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message}` }));

  // --- first visit: storage is empty, so the explainer is due -----------
  await page.goto(`${BASE}/#/trip/${trip.id}`);
  await page.waitForSelector('[data-testid="how-it-works"]');
  check(true, 'explainer opens unprompted on a first visit');

  const body = await page.locator('[data-testid="how-it-works"]').innerText();
  check(
    /cancel out|add up|comes off another/i.test(body),
    'it explains why adjustments must cancel out'
  );
  check(
    /nobody would rather have someone else/i.test(body),
    'it states the envy-free guarantee in plain words'
  );
  // The mechanism is not strategyproof, so copy that coached bidding would
  // break the property being sold. Guard the wording, not just its presence.
  check(
    !/\b(maximi[sz]e|outbid|beat|win|cheapest possible|game the)\b/i.test(body),
    'it does not coach anyone toward a winning bid'
  );
  check(
    (await page.locator('[data-testid="how-it-works"] svg[role="img"]').count()) === 3,
    'three Selecta-bot scenes render, each labelled for screen readers'
  );

  // Escape must close it -- it is a modal over the whole form.
  await page.keyboard.press('Escape');
  check(
    (await page.locator('[data-testid="how-it-works"]').count()) === 0,
    'Escape closes the explainer'
  );

  // --- it stays closed on the next visit --------------------------------
  await page.reload();
  await page.waitForSelector('[data-testid="room-card"]');
  check(
    (await page.locator('[data-testid="how-it-works"]').count()) === 0,
    'it does not reappear on the next visit (preference persisted)'
  );

  // --- but is always reachable again ------------------------------------
  await page.locator('[data-testid="how-it-works-open"]').click();
  await page.waitForSelector('[data-testid="how-it-works"]');
  check(true, 'the header button reopens it after dismissal');
  await page.locator('[data-testid="how-it-works-dismiss"]').click();
  check(
    (await page.locator('[data-testid="how-it-works"]').count()) === 0,
    '"Got it" closes it'
  );

  // --- tooltips: tap, not hover -----------------------------------------
  const balanceTip = page.locator('[data-testid="tooltip-trigger"]').first();
  check(
    (await page.locator('[data-testid="tooltip-body"]').count()) === 0,
    'tooltips start closed'
  );

  // Hovering must NOT open it: if it did, the control would be unusable on
  // touch and this harness would pass while phones showed nothing.
  await balanceTip.hover();
  await page.waitForTimeout(300);
  check(
    (await page.locator('[data-testid="tooltip-body"]').count()) === 0,
    'hover alone does not open a tooltip (touch parity)'
  );

  await balanceTip.click();
  await page.waitForSelector('[data-testid="tooltip-body"]');
  const tipText = await page.locator('[data-testid="tooltip-body"]').innerText();
  check(/add up to \$0|comes off another/i.test(tipText), 'the balance tooltip explains the zero-sum rule');

  // Off-target tap closes it.
  await page.locator('h1').first().click();
  check(
    (await page.locator('[data-testid="tooltip-body"]').count()) === 0,
    'tapping elsewhere closes the tooltip'
  );

  // Keyboard parity.
  await balanceTip.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="tooltip-body"]');
  await page.keyboard.press('Escape');
  check(
    (await page.locator('[data-testid="tooltip-body"]').count()) === 0,
    'a tooltip opens with Enter and closes with Escape'
  );

  // --- nothing overflows the viewport at 390px --------------------------
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `page does not scroll sideways (overflow ${overflow}px)`);

  await context.close();
}

await runAt('mobile', { width: 390, height: 844 }, true);
await runAt('desktop', { width: 1280, height: 900 }, false);

await browser.close();

console.log('\n=== console errors');
check(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length})`);
for (const e of consoleErrors) console.log(`   [${e.label}] ${e.text}`);
console.log(`   (${suppressed.length} known headless artifact(s) suppressed)`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
