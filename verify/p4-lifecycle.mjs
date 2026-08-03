/**
 * Closes the two open P4 gaps, through the real dashboard in production.
 *
 * Usage:
 *   APPCHECK_DEBUG_TOKEN=... \
 *   PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/p4-lifecycle.mjs <editTripId> <editAdminCode> \
 *                                  <allocTripId> <allocAdminCode>
 *
 *   editTripId   a [demo] trip with NO submissions -- updateTrip refuses
 *                otherwise, which is the behaviour, not a limitation.
 *   allocTripId  a FINALIZED [demo] trip, i.e. one verify/e2e-napa-flow.mjs
 *                has already run against.
 *
 * Gap 1 -- updateTrip had no dashboard form. Exercised by typing in the form
 * and reading the result back through getAdminData, not by calling the
 * callable directly: the callable was already verified, the UI was the gap.
 *
 * Gap 2 -- reopen -> re-allocate had never been composed. Reopen was verified
 * to clear assignments and reset status; that says nothing about whether
 * allocateRooms produces a correct result on the state reopen leaves behind.
 * The acceptance criterion is "a fresh, envy-free result", so this re-runs the
 * allocation from the dashboard and audits the assignments Firestore actually
 * holds with verify/envy-audit.cjs -- the same independent checker behind the
 * committed 576-trip simulation, deliberately not the allocator's self-check.
 *
 * Dark mode, 390px and desktop, and any console error fails the run.
 */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const adminSdk = require('firebase-admin');
const {audit} = require('./envy-audit.cjs');

const [editTripId, editAdminCode, allocTripId, allocAdminCode] = process.argv.slice(2);
if (!editTripId || !editAdminCode || !allocTripId || !allocAdminCode) {
  console.error('usage: node verify/p4-lifecycle.mjs <editTripId> <editAdminCode> ' +
      '<allocTripId> <allocAdminCode>');
  process.exit(2);
}

try {
  adminSdk.initializeApp({
    credential: adminSdk.credential.cert(require('../seed/serviceAccountKey.json')),
  });
} catch {
  console.error('needs seed/serviceAccountKey.json (same key the seed script uses)');
  process.exit(2);
}
const db = adminSdk.firestore();

const BASE = 'https://www.roomselector5000.com';
const SHOT_DIR = new URL('../.tmp-verify/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, {recursive: true});

const DEBUG_TOKEN = process.env.APPCHECK_DEBUG_TOKEN || '';
if (!DEBUG_TOKEN) {
  console.error('APPCHECK_DEBUG_TOKEN is required — App Check rejects every ' +
      'admin callable without it and this whole run would fail as if the ' +
      'product were broken.');
  process.exit(2);
}

const consoleErrors = [];
const failures = [];
let checks = 0;

/** @param {string} t @returns {boolean} known headless-only artifact */
const isHeadlessArtifact = (t) => t.includes('requestStorageAccess: Permission denied');

function check(label, ok, detail) {
  checks++;
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({colorScheme: 'dark', viewport});
  await ctx.addInitScript((t) => {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = t;
  }, DEBUG_TOKEN);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !isHeadlessArtifact(m.text())) {
      consoleErrors.push({url: page.url(), text: m.text()});
    }
  });
  page.on('pageerror', (e) => consoleErrors.push({url: page.url(), text: `pageerror: ${e.message}`}));
  // Every lifecycle action confirms first, deliberately -- accept them.
  page.on('dialog', (d) => d.accept());
  return page;
}

async function readTrip(tripId) {
  const [trip, rooms, subs, assigns] = await Promise.all([
    db.collection('trips').doc(tripId).get(),
    db.collection('rooms').where('tripId', '==', tripId).get(),
    db.collection('submissions').where('tripId', '==', tripId).get(),
    db.collection('assignments').where('tripId', '==', tripId).get(),
  ]);
  return {
    trip: trip.data(),
    rooms: rooms.docs.map((d) => ({id: d.id, ...d.data()})),
    submissions: subs.docs.map((d) => ({id: d.id, ...d.data()})),
    assignments: assigns.docs.map((d) => ({id: d.id, ...d.data()})),
  };
}

// ---------------------------------------------------------------------------
// Gap 1: edit trip and beds through the dashboard form.
// ---------------------------------------------------------------------------
console.log('\n=== gap 1: updateTrip via the dashboard form (390px, dark) ===');
{
  const page = await newPage({width: 390, height: 844});
  await page.goto(`${BASE}/#/admin/${editTripId}?code=${editAdminCode}`,
      {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-ad-free="admin"]', {timeout: 20000});

  const before = await readTrip(editTripId);
  check('fixture has no submissions (updateTrip precondition)',
      before.submissions.length === 0, `${before.submissions.length} found`);

  const editBtn = page.getByRole('button', {name: 'Edit trip and beds'});
  check('the form is reachable at all — this is the gap', await editBtn.count() > 0);
  await editBtn.first().click();

  // A name the assertion can be sure came from this run.
  const stamp = Date.now();
  const newName = `[demo] Edited By Harness ${stamp}`;
  const newCost = 7777;

  await page.getByLabel('Trip name').fill(newName);
  await page.getByLabel('Total trip cost ($)').fill(String(newCost));

  // Rename the first bed and add one, so the wholesale room replacement is
  // exercised rather than just the scalar fields.
  const bedNames = page.getByLabel('Bed name *');
  const originalBedCount = await bedNames.count();
  await bedNames.first().fill(`Renamed Bed ${stamp}`);
  await page.getByRole('button', {name: 'Add another bed'}).click();
  await page.getByLabel('Bed name *').last().fill(`Added Bed ${stamp}`);

  await page.screenshot({path: `${SHOT_DIR}p4-edit-form.png`, fullPage: true});

  await page.getByRole('button', {name: 'Save changes'}).click();
  await page.getByText('Saved.').waitFor({timeout: 30000});

  const after = await readTrip(editTripId);
  check('trip name updated', after.trip.name === newName, after.trip.name);
  check('total cost updated', after.trip.totalTripCost === newCost,
      String(after.trip.totalTripCost));
  check('bed added', after.rooms.length === originalBedCount + 1,
      `${originalBedCount} -> ${after.rooms.length}`);
  check('bed renamed', after.rooms.some((r) => r.name === `Renamed Bed ${stamp}`));
  check('new bed persisted', after.rooms.some((r) => r.name === `Added Bed ${stamp}`));
  check('no orphaned duplicate rooms', after.rooms.length === originalBedCount + 1,
      `rooms=${after.rooms.map((r) => r.name).join(' | ')}`);

  // The dashboard must show the edit without a manual refresh.
  await page.waitForTimeout(1500);
  check('dashboard reflects the new name without a reload',
      (await page.locator('h1').first().innerText()).includes('Edited By Harness'));

  await page.screenshot({path: `${SHOT_DIR}p4-edit-saved.png`, fullPage: true});
  await page.context().close();
}

// ---------------------------------------------------------------------------
// Gap 1b: the refusal path. A trip WITH submissions must explain itself.
// ---------------------------------------------------------------------------
console.log('\n=== gap 1b: editing is refused once someone has submitted ===');
{
  const page = await newPage({width: 1280, height: 900});
  await page.goto(`${BASE}/#/admin/${allocTripId}?code=${allocAdminCode}`,
      {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-ad-free="admin"]', {timeout: 20000});
  const body = await page.locator('[data-ad-free="admin"]').innerText();
  check('edit is not offered while submissions exist',
      await page.getByRole('button', {name: 'Edit trip and beds'}).count() === 0);
  check('and it says why rather than just disappearing',
      body.includes('already submitted'));
  await page.context().close();
}

// ---------------------------------------------------------------------------
// Gap 2: reopen -> re-allocate, and audit the result.
// ---------------------------------------------------------------------------
console.log('\n=== gap 2: reopen -> re-allocate (desktop, dark) ===');
{
  const page = await newPage({width: 1280, height: 900});
  await page.goto(`${BASE}/#/admin/${allocTripId}?code=${allocAdminCode}`,
      {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-ad-free="admin"]', {timeout: 20000});

  const before = await readTrip(allocTripId);
  check('fixture starts finalized', before.trip.status === 'finalized', before.trip.status);
  check('fixture starts with assignments', before.assignments.length > 0,
      `${before.assignments.length}`);
  const firstAudit = audit(before.rooms, before.submissions,
      before.assignments.map((a) => ({
        emails: a.emails, bedIds: a.roomIds, finalPerPerson: a.priceAdjustment,
      })));
  check('the ORIGINAL allocation is envy-free (baseline)',
      firstAudit.envyPairs === 0, `envyPairs=${firstAudit.envyPairs}`);

  await page.getByRole('button', {name: 'Reopen trip'}).click();
  await page.getByRole('button', {name: 'Run Room Allocation'}).waitFor({timeout: 40000});

  const reopened = await readTrip(allocTripId);
  check('reopen reset status to collecting',
      reopened.trip.status === 'collecting', reopened.trip.status);
  check('reopen deleted every assignment',
      reopened.assignments.length === 0, `${reopened.assignments.length} left`);
  check('reopen KEPT the submissions — re-allocating needs the ballots',
      reopened.submissions.length === before.submissions.length,
      `${before.submissions.length} -> ${reopened.submissions.length}`);
  await page.screenshot({path: `${SHOT_DIR}p4-reopened.png`, fullPage: true});

  // The composition that had never been exercised.
  await page.getByRole('button', {name: 'Run Room Allocation'}).click();
  await page.getByRole('button', {name: 'View Results'}).waitFor({timeout: 120000});

  const after = await readTrip(allocTripId);
  check('re-allocation finalized the trip', after.trip.status === 'finalized', after.trip.status);
  check('a fresh set of assignments exists',
      after.assignments.length === before.assignments.length,
      `${after.assignments.length} (was ${before.assignments.length})`);
  check('assignment docs are new, not the reopened ones revived',
      after.assignments.every((a) => !before.assignments.some((b) => b.id === a.id)));

  const reAudit = audit(after.rooms, after.submissions,
      after.assignments.map((a) => ({
        emails: a.emails, bedIds: a.roomIds, finalPerPerson: a.priceAdjustment,
      })));
  check('THE ACCEPTANCE CRITERION: re-allocation is envy-free',
      reAudit.envyPairs === 0, `envyPairs=${reAudit.envyPairs}, maxEnvy=${reAudit.maxEnvy}`);
  check('per-person adjustments still sum to zero',
      reAudit.budgetError < 1e-6, `budgetError=${reAudit.budgetError}`);
  check('everyone is still placed',
      reAudit.parties === firstAudit.parties, `${reAudit.parties} vs ${firstAudit.parties}`);

  console.log(`       welfare/person ${reAudit.welfarePerPerson.toFixed(2)} ` +
      `(was ${firstAudit.welfarePerPerson.toFixed(2)}), ` +
      `worst surplus ${reAudit.worstSurplus.toFixed(2)} ` +
      `(was ${firstAudit.worstSurplus.toFixed(2)})`);

  // Results must render for real -- the assignment cards, not an empty state.
  // Navigated with an explicit code rather than by clicking "View Results":
  // that button goes to /results/:tripId with no code, so it lands on the
  // "enter your trip code" prompt. Noted as a papercut, not fixed here.
  await page.goto(`${BASE}/#/results/${allocTripId}?code=${allocAdminCode}`,
      {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-ad-free="results"]', {timeout: 30000});
  const resultsText = await page.locator('[data-ad-free="results"]').innerText();
  check('results page renders the re-allocated assignments',
      resultsText.includes('Room Assignments') && /\$\d/.test(resultsText));
  await page.screenshot({path: `${SHOT_DIR}p4-reallocated-results.png`, fullPage: true});
  await page.context().close();
}

await browser.close();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} console error(s):`);
  for (const e of consoleErrors) console.error(`  ${e.url}\n    ${e.text}`);
}
if (failures.length || consoleErrors.length) {
  console.error(`\nFAILED: ${failures.length} check(s), ${consoleErrors.length} console error(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\nPASS — updateTrip is reachable and persists; reopen -> re-allocate ' +
    'produces a fresh envy-free result.');
