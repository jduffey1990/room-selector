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
 * four demo participants (one +copy couple, two singles), runs allocation as
 * admin, and loads results with the participant code. It runs a dark-mode
 * browser context and fails on any console error on any page — every
 * production bug so far has been invisible to HTTP status codes.
 */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const [tripId, participantCode, adminCode] = process.argv.slice(2);
if (!tripId || !participantCode || !adminCode) {
  console.error('usage: node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>');
  process.exit(2);
}

const BASE = 'https://room-selector.web.app';
const SHOT_DIR = new URL('../.tmp-verify/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, {recursive: true});

const consoleErrors = [];
const dialogs = [];

const browser = await chromium.launch();
const context = await browser.newContext({colorScheme: 'dark', viewport: {width: 1280, height: 900}});
context.on('page', (page) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({url: page.url(), text: msg.text()});
  });
  page.on('pageerror', (err) => consoleErrors.push({url: page.url(), text: `pageerror: ${err.message}`}));
});

const card = (name) => `div.bg-white.rounded-lg.shadow-lg.overflow-hidden:has(h3:text-is("${name}"))`;

async function submitParticipant(email, prefOrder, adjustments = {}) {
  const page = await context.newPage();
  page.on('dialog', async (d) => {
    dialogs.push({email, type: d.type(), message: d.message()});
    await d.accept();
  });
  await page.goto(`${BASE}/#/trip/${tripId}`);
  await page.waitForSelector('h3:text-is("Main Bedroom")', {timeout: 30000});

  await page.fill('input[type="email"]', email);

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
  await page.close();
}

// One couple via the +copy mechanism the deployed v1 allocator expects,
// plus two singles. 3 parties, 3 beds.
await submitParticipant('demo-anna@example.com', ['Main Bedroom', 'Guest Room', 'Daybed Alcove'],
    {'Main Bedroom': 25, 'Daybed Alcove': -25});
await submitParticipant('demo-anna+copy@example.com', ['Main Bedroom', 'Guest Room', 'Daybed Alcove']);
await submitParticipant('demo-ben@example.com', ['Guest Room', 'Main Bedroom', 'Daybed Alcove']);
await submitParticipant('demo-cara@example.com', ['Daybed Alcove', 'Guest Room']);

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
