/**
 * P5.2 — the partner control, in a browser.
 *
 * verify/p5-couples.cjs proves the pairing logic. This proves the half a
 * person actually touches: that the dropdown is populated from
 * listParticipantNames, that the escape hatch appears when the partner has
 * not submitted, and — the assertion that matters most — that NO email
 * address reaches the page.
 *
 * Emulator-only. Seeds a submission directly into Firestore rather than
 * through the callable, because the point here is the read path.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/p5-partner-ui.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import admin from 'firebase-admin';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TRIP_NAME = '[demo] Breckenridge Ski Week';
const SEEDED = [
  { email: 'seed-priya@example.com', displayName: 'Priya' },
  { email: 'seed-marcus@example.com', displayName: 'Marcus' },
  // Deliberate collision: two people called Sam must be told apart, or
  // picking the wrong one puts two people who never agreed in one bed.
  { email: 'seed-sam-a@example.com', displayName: 'Sam' },
  { email: 'seed-sam-b@example.com', displayName: 'Sam' },
];

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

// Clean slate, then seed.
const stale = await db.collection('submissions').where('tripId', '==', trip.id).get();
await Promise.all(stale.docs.map((d) => d.ref.delete()));
for (const p of SEEDED) {
  await db.collection('submissions').add({
    tripId: trip.id, email: p.email, displayName: p.displayName,
    partnerSubmissionId: null, partnerClaimName: null, partnerEmail: null,
    preferences: [], roomPrices: [], totalAdjustment: 0,
    timestamp: new Date().toISOString(),
  });
}

function readDebugToken() {
  if (process.env.APPCHECK_DEBUG_TOKEN) return process.env.APPCHECK_DEBUG_TOKEN;
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split('\n').find((l) => l.trim().startsWith('APPCHECK_DEBUG_TOKEN='));
    return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
const DEBUG_TOKEN = readDebugToken();

const consoleErrors = [];
const browser = await chromium.launch();

async function runAt(label, viewport) {
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}), dark mode`);
  const context = await browser.newContext({ colorScheme: 'dark', viewport });
  if (DEBUG_TOKEN) {
    await context.addInitScript((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, DEBUG_TOKEN);
  }
  await context.addInitScript(() => {
    try { localStorage.setItem('rs5000.howItWorks.v1', '1'); } catch { /* ignore */ }
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('requestStorageAccess')) {
      consoleErrors.push({ label, text: m.text() });
    }
  });
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message}` }));

  await page.goto(`${BASE}/#/trip/${trip.id}`);
  await page.waitForSelector('[data-testid="partner-select"]');

  const select = page.locator('[data-testid="partner-select"]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="partner-select"] option').length > 2,
    null, { timeout: 10000 }
  );
  const options = (await select.locator('option').allTextContents()).map((t) => t.trim());

  check(options.some((o) => o === 'Priya'), 'a participant who has submitted is selectable by name');
  check(options.some((o) => o === 'Marcus'), 'and so is the next one');
  check(
    options.some((o) => /^Nobody/.test(o)) && options.some((o) => /hasn.t submitted yet/.test(o)),
    'both escape hatches are offered: nobody, and not-yet-submitted'
  );

  // THE invariant. A full address must never reach a participant's browser.
  const html = await page.content();
  const leaked = SEEDED.map((p) => p.email).filter((e) => html.includes(e));
  check(leaked.length === 0, `no email address appears anywhere in the page (${leaked.join(', ') || 'clean'})`);

  // Collisions get a masked hint, and only collisions.
  const sams = options.filter((o) => o.startsWith('Sam'));
  check(sams.length === 2 && sams.every((o) => /\(\S+•+\S*@/.test(o)),
    `both Sams carry a masked hint (${sams.join(' / ')})`);
  check(!options.find((o) => o === 'Priya')?.includes('('),
    'a unique name gets no hint — masking is not the default');

  // The escape hatch reveals a name field, not an email field.
  check(
    (await page.locator('[data-testid="partner-claim-name"]').count()) === 0,
    'the name field is hidden until it is needed'
  );
  await select.selectOption('__claim__');
  await page.waitForSelector('[data-testid="partner-claim-name"]');
  const claimType = await page.locator('[data-testid="partner-claim-name"]').getAttribute('type');
  check(claimType === 'text', `the escape hatch asks for a name, not an address (type=${claimType})`);

  // Submit stays blocked until the revealed field is filled -- otherwise the
  // button enables onto a validation alert.
  await page.locator('[data-testid="display-name"]').fill('Test Person');
  const submit = page.locator('button:has-text("Submit"), button:has-text("Verify Email")').first();
  check(await submit.isDisabled(), 'submit is blocked while the claimed name is empty');

  await page.locator('[data-testid="partner-claim-name"]').fill('Kate');
  await select.selectOption('__claim__');
  check(
    (await page.locator('[data-testid="partner-claim-name"]').inputValue()) === 'Kate',
    'the typed name survives re-selecting the same option'
  );

  await context.close();
}

await runAt('mobile', { width: 390, height: 844 });
await runAt('desktop', { width: 1280, height: 900 });

await browser.close();

// Leave nothing behind: a stray submission changes what the next harness sees.
const planted = await db.collection('submissions').where('tripId', '==', trip.id).get();
await Promise.all(planted.docs.map((d) => d.ref.delete()));
console.log(`\ncleaned up ${planted.size} seeded submission(s)`);

console.log('\n=== console errors');
check(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length})`);
for (const e of consoleErrors) console.log(`   [${e.label}] ${e.text}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
