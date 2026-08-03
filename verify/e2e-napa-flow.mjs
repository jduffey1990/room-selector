/**
 * End-to-end proof of the last untested production path:
 *   submitPreferences -> allocateRooms -> ResultsView
 * against the deployed site and the [demo] Napa Cabin Weekend trip.
 *
 * Usage:
 *   PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>
 *
 * Codes come from `node seed/seed-demo-trips.js` output. The script submits
 * four demo participants (one mutually-confirmed couple, two singles), runs
 * allocation as admin, and loads results with the participant code. It runs a dark-mode
 * browser context and fails on any console error on any page — every
 * production bug so far has been invisible to HTTP status codes.
 */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const adminSdk = require('firebase-admin');

const [tripId, participantCode, adminCode] = process.argv.slice(2);
if (!tripId || !participantCode || !adminCode) {
  console.error('usage: node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>');
  process.exit(2);
}

// P1.1 made submitPreferences reject anything without a verified session, and
// a headless browser cannot click a link in a real inbox. generateSignInWith-
// EmailLink builds the genuine magic link and returns it WITHOUT sending mail,
// so the harness walks the real production journey — action handler, sign-in,
// resumed submission — with no bypass in the callable and no mail to fake
// addresses. Decided 2026-08-03 over a custom-token shortcut, which would have
// verified that submission works given a session rather than that a person can
// obtain one; the magic-link half is exactly where the bugs were.
try {
  adminSdk.initializeApp({
    credential: adminSdk.credential.cert(require('../seed/serviceAccountKey.json')),
  });
} catch {
  console.error('needs seed/serviceAccountKey.json (same key the seed script uses)');
  process.exit(2);
}

const BASE = 'https://room-selector.web.app';
const SHOT_DIR = new URL('../.tmp-verify/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, {recursive: true});

const consoleErrors = [];
const dialogs = [];

const browser = await chromium.launch();

/**
 * A fresh browser context with console/page-error capture attached.
 *
 * Every participant needs their own: Firebase Auth persists the session per
 * origin, so sharing one context would sign every participant in as whoever
 * signed in first, and the trip would be allocated over one ballot repeated.
 */
function newContext() {
  const ctx = browser.newContext({colorScheme: 'dark', viewport: {width: 1280, height: 900}});
  return ctx.then((c) => {
    c.on('page', (page) => {
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push({url: page.url(), text: msg.text()});
      });
      page.on('pageerror', (err) => consoleErrors.push({url: page.url(), text: `pageerror: ${err.message}`}));
    });
    return c;
  });
}

const context = await newContext();

const card = (name) => `[data-testid="room-card"]:has(h3:text-is("${name}"))`;

async function submitParticipant(email, prefOrder, adjustments = {}, partner = null) {
  const ctx = await newContext();
  const page = await ctx.newPage();
  page.on('dialog', async (d) => {
    dialogs.push({email, type: d.type(), message: d.message()});
    // completeSignIn() prompts for the address when it has no stashed
    // submission — the normal "requested on a laptop, opened on a phone" path.
    // Answer it; accepting blank would fail sign-in with a confusing error.
    if (d.type() === 'prompt') await d.accept(email);
    else await d.accept();
  });

  // Sign in first. The form then short-circuits at SubmissionForm's
  // `if (user?.email)` branch and posts directly, so no verification mail is
  // ever generated for these fake addresses.
  const link = await adminSdk.auth().generateSignInWithEmailLink(email, {
    url: `${BASE}/`,
    handleCodeInApp: true,
  });
  await page.goto(link);
  // Wait for a POSITIVE signal that sign-in finished, not for a spinner to be
  // absent. Waiting on the BotLoading label being 'detached' passes instantly
  // when the label simply is not on screen yet, so the harness navigated away
  // mid-sign-in and every participant silently stayed logged out.
  //
  // On success App.jsx replaceState's to '/#/' and renders the home route, so
  // the hero heading is the signal. Race it against the error branch: a spent
  // or invalid code otherwise shows up 30s later as a mystery timeout.
  await Promise.race([
    page.waitForSelector('h1:has-text("ROOM SELECTOR 5000")', {timeout: 30000}),
    page.waitForSelector('text=verification link has expired', {timeout: 30000})
        .then(() => {
          throw new Error(`sign-in link rejected for ${email}`);
        }),
  ]);

  await page.goto(`${BASE}/#/trip/${tripId}`);
  await page.waitForSelector('h3:text-is("Main Bedroom")', {timeout: 30000});

  // Assert the signed-in state explicitly. The submit button reads "Verify
  // Email & Submit" when logged out and "Submit Preferences" when logged in,
  // so a failed sign-in otherwise surfaces 30s later as an opaque locator
  // timeout that says nothing about the cause.
  const label = await page.locator('button:has-text("Submit")').first().innerText();
  if (!label.includes('Submit Preferences')) {
    throw new Error(`${email} is not signed in — submit button reads "${label}"`);
  }

  // Own-email field renders disabled once signed in (value comes from the
  // token), so it is not filled here. The partner field is still the second
  // email input and still editable.
  if (partner) await page.locator('input[type="email"]').nth(1).fill(partner);

  for (const roomName of prefOrder) {
    await page.locator(`${card(roomName)} button:text-is("Add to Preferences")`).click();
  }

  for (const [roomName, delta] of Object.entries(adjustments)) {
    await page.locator(`${card(roomName)} button:text-is("+ Show Price Adjustment")`).click();
    const btn = delta > 0 ? '+$25' : '-$25';
    for (let i = 0; i < Math.abs(delta) / 25; i++) {
      await page.locator(`${card(roomName)} button:text-is("${btn}")`).click();
    }
    await page.locator(`${card(roomName)} button:text-is("− Hide Price Adjustment")`).click();
  }

  await page.waitForSelector('text=Perfect! Your adjustments sum to zero.', {timeout: 5000});
  await page.locator('button:text-is("Submit Preferences")').click();
  await page.waitForSelector('text=Submitted!', {timeout: 30000});
  console.log(`submitted: ${email}`);
  // Close the whole context, not just the page: the Auth session lives in
  // context storage and would otherwise leak into the next participant.
  await ctx.close();
}

// One couple via mutual partner confirmation (P1.2), plus two singles.
// 3 parties, 3 beds.
// The default scenario's near-uniform bids happen to price identically under
// v1 and the envy-free allocator; pass --discriminating for bids on which the
// two mechanisms provably disagree (v1: couple->Main/ben->Guest/cara->Daybed
// at +141.25/+68.75/-351.25; envy-free: couple->Guest/ben->Daybed/cara->Main
// at +15.00/-305.00/+275.00), which proves which one is deployed.
const discriminating = process.argv.includes('--discriminating');
await submitParticipant('demo-anna@example.com', ['Main Bedroom', 'Guest Room', 'Daybed Alcove'],
    {'Main Bedroom': 25, 'Daybed Alcove': -25}, 'demo-alex@example.com');
await submitParticipant('demo-alex@example.com', ['Main Bedroom', 'Guest Room', 'Daybed Alcove'],
    {}, 'demo-anna@example.com');
if (discriminating) {
  await submitParticipant('demo-ben@example.com', ['Guest Room', 'Main Bedroom', 'Daybed Alcove'],
      {'Main Bedroom': -100, 'Guest Room': 100});
  await submitParticipant('demo-cara@example.com', ['Main Bedroom', 'Guest Room', 'Daybed Alcove'],
      {'Main Bedroom': 100, 'Daybed Alcove': -100});
} else {
  await submitParticipant('demo-ben@example.com', ['Guest Room', 'Main Bedroom', 'Daybed Alcove']);
  await submitParticipant('demo-cara@example.com', ['Daybed Alcove', 'Guest Room']);
}

// Admin: run allocation. confirm() then result alert() are auto-accepted and
// recorded via the dialog handler.
const admin = await context.newPage();
let allocationAlert = null;
admin.on('dialog', async (d) => {
  dialogs.push({page: 'admin', type: d.type(), message: d.message()});
  if (d.type() === 'alert') allocationAlert = d.message();
  await d.accept();
});
await admin.goto(`${BASE}/#/admin/${tripId}?code=${adminCode}`);
await admin.waitForSelector('button:has-text("Run Room Allocation")', {timeout: 30000});
await admin.screenshot({path: `${SHOT_DIR}admin-before.png`, fullPage: true});
await admin.locator('button:has-text("Run Room Allocation")').click();
await admin.waitForSelector('text=✓ Finalized', {timeout: 60000});
await admin.screenshot({path: `${SHOT_DIR}admin-after.png`, fullPage: true});
console.log(`allocation alert: ${JSON.stringify(allocationAlert)}`);
await admin.close();

// Results, gated on the participant code.
const results = await context.newPage();
await results.goto(`${BASE}/#/results/${tripId}?code=${participantCode}`);
await results.waitForSelector('text=Main Bedroom', {timeout: 30000});
await results.screenshot({path: `${SHOT_DIR}results.png`, fullPage: true});
const bodyText = await results.locator('body').innerText();
console.log('--- results page text ---');
console.log(bodyText);
await results.close();

await browser.close();

if (!allocationAlert || !allocationAlert.includes('Allocation complete!')) {
  console.error(`FAIL: allocation did not report success: ${JSON.stringify(allocationAlert)}`);
  process.exit(1);
}
if (consoleErrors.length > 0) {
  console.error(`FAIL: ${consoleErrors.length} console error(s):`);
  for (const e of consoleErrors) console.error(`  [${e.url}] ${e.text}`);
  process.exit(1);
}
console.log('PASS: submit -> allocate -> results completed with zero console errors.');
