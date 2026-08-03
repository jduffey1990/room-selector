#!/usr/bin/env node
/**
 * Drives the whole P1.1 participant journey in a real browser: fill the form,
 * request a link, click the link out of the Auth emulator's inbox, and land on
 * a submitted trip -- without retyping anything.
 *
 * Production e2e cannot click a link in a real inbox, which is why this path
 * is local (docs/drafts/P1.1-magic-link-auth.md, "Config/ops").
 *
 *   firebase emulators:start --only auth,functions
 *   npm run dev -- --port 5173
 *   PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/local-magiclink-flow.mjs
 *
 * Asserts zero console errors, in dark mode, at 390px and at desktop width.
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const admin = require('../seed/node_modules/firebase-admin');
const serviceAccount = require('../seed/serviceAccountKey.json');

const PROJECT = 'room-selector';
const AUTH_EMU = 'http://127.0.0.1:9099';
const BASE = process.env.BASE || 'http://localhost:5173';
// Same gitignored scratch directory the production e2e uses.
const SHOT_DIR = new URL('../.tmp-verify/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, { recursive: true });
const EMAIL = 'demo-magiclink@example.com';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok' : 'FAIL'}: ${what}`);
  if (!ok) failures++;
};

const tripsSnap = await db.collection('trips').get();
const trip = tripsSnap.docs.find((d) => (d.data().name || '') === '[demo] Napa Cabin Weekend');
if (!trip) {
  console.error('Missing "[demo] Napa Cabin Weekend". Run: node seed/seed-demo-trips.js');
  process.exit(1);
}

// Leave no submission behind from a previous run, or the callable correctly
// rejects this one as a duplicate and the run reports a false failure.
const stale = await db.collection('submissions')
  .where('tripId', '==', trip.id).where('email', '==', EMAIL).get();
await Promise.all(stale.docs.map((d) => d.ref.delete()));

const consoleErrors = [];
const dialogs = [];
const browser = await chromium.launch();

/** Runs the full journey at one viewport size. */
async function runAt(label, viewport) {
  console.log(`\n=== ${label} (${viewport.width}x${viewport.height}), dark mode`);
  const context = await browser.newContext({ colorScheme: 'dark', viewport });
  // P5.3's first-run explainer is a modal over this form and each context
  // starts with empty storage, so without this it covers the page at both
  // viewports and every click lands on the overlay. verify/p5-guidance.mjs
  // owns the dialog's own behaviour; this harness is about the magic link.
  await context.addInitScript(() => {
    try { localStorage.setItem('rs5000.howItWorks.v1', '1'); } catch { /* ignore */ }
  });
  context.on('page', (page) => {
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ label, text: m.text() });
    });
    page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message}` }));
    // An unhandled alert() blocks the page forever and reads as a timeout.
    page.on('dialog', async (d) => {
      dialogs.push({ label, type: d.type(), message: d.message() });
      await d.accept();
    });
  });

  const page = await context.newPage();
  await page.goto(`${BASE}/#/trip/${trip.id}`);
  await page.waitForSelector('h3:text-is("Main Bedroom")', { timeout: 30000 });

  await page.locator('input[type="email"]').nth(0).fill(EMAIL);
  await page.locator('[data-testid="room-card"]:has(h3:text-is("Main Bedroom")) button:text-is("Add to Preferences")').click();
  await page.locator('[data-testid="room-card"]:has(h3:text-is("Guest Room")) button:text-is("Add to Preferences")').click();

  // Unverified visitors are told what the button will do before they press it.
  const cta = page.locator('button:has-text("Verify Email & Submit")');
  check(await cta.isVisible(), 'button reads "Verify Email & Submit" before verification');
  await page.screenshot({ path: `${SHOT_DIR}magiclink-${label}-form.png`, fullPage: true });

  await cta.click();
  await page.waitForSelector('text=Check your email', { timeout: 30000 });
  check(true, 'reached the "Check your email" screen');
  check(
    await page.locator(`text=${EMAIL}`).first().isVisible(),
    'the screen names the address the link went to'
  );
  await page.screenshot({ path: `${SHOT_DIR}magiclink-${label}-awaiting.png`, fullPage: true });

  // The emulator holds generated links instead of sending them.
  const inbox = await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await inbox.json();
  const mine = oobCodes.filter((c) => c.email === EMAIL).pop();
  check(!!mine?.oobCode, 'a sign-in link was issued');
  if (!mine?.oobCode) return context.close();

  // Built rather than followed: the emulator's own /emulator/action page
  // applies the code before redirecting, so the app would receive one already
  // spent. The real action handler passes it through. This URL is the shape
  // the app actually sees on return, which is the part under test.
  await page.goto(
    `${BASE}/?apiKey=fake-api-key&mode=signIn&lang=en&oobCode=${mine.oobCode}`
  );
  // Auto-submit on return is the point: the bids survived the round trip.
  await page.waitForSelector('text=Submitted!', { timeout: 30000 });
  check(true, 'clicking the link submitted automatically, with no retyping');
  await page.screenshot({ path: `${SHOT_DIR}magiclink-${label}-submitted.png`, fullPage: true });

  const written = await db.collection('submissions')
    .where('tripId', '==', trip.id).where('email', '==', EMAIL).get();
  check(written.size === 1, `exactly one submission stored (got ${written.size})`);
  if (!written.empty) {
    const data = written.docs[0].data();
    check(data.email === EMAIL, 'stored email matches the verified address');
    check(Array.isArray(data.preferences) && data.preferences.length === 2,
      `both ranked rooms survived the round trip (got ${data.preferences?.length})`);
  }

  // Revisiting with a live session. A reload, not a goto: the app is already
  // at this URL, so navigating to it would not remount anything.
  await page.reload();
  await page.waitForSelector('h3:text-is("Main Bedroom")', { timeout: 30000 });
  const verifiedNote = page.locator('text=Verified — your submission is recorded under this address.');
  check(await verifiedNote.isVisible(), 'returning visitor is shown as already verified');

  await Promise.all(written.docs.map((d) => d.ref.delete()));
  await context.close();
}

await runAt('mobile', { width: 390, height: 844 });
await runAt('desktop', { width: 1280, height: 900 });
await browser.close();

if (dialogs.length) {
  console.log('\n=== dialogs raised');
  for (const d of dialogs) console.log(`   [${d.label}] ${d.type}: ${d.message}`);
}

console.log('\n=== console errors');
check(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length})`);
for (const e of consoleErrors) console.log(`   [${e.label}] ${e.text}`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
