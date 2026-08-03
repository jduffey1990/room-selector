/**
 * Proves the P2.2 acceptance criterion that is a NEGATIVE: no ad markup
 * renders inside money or fairness UI.
 *
 * Usage:
 *   APPCHECK_DEBUG_TOKEN=... \
 *   PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
 *     node verify/ads-placement.mjs <tripId> <participantCode> <adminCode>
 *
 * Run it against a FINALIZED trip, or the results route renders "Results Not
 * Available" and the assignment cards -- the single most important thing to
 * check -- never exist. `verify/e2e-napa-flow.mjs` finalizes the demo trip.
 *
 * What this can and cannot prove, stated plainly so nobody over-reads a pass:
 *
 *   CAN, today: that the AdSense loader is present on the routes chosen for
 *   monetization and absent on every money route -- on a direct load AND after
 *   an in-session SPA navigation into one. That is a structural property of
 *   this app, true regardless of the AdSense account state, and it is the
 *   actual enforcement mechanism (see src/ads.js).
 *
 *   CANNOT, until the site is approved and Auto ads is switched on: that a
 *   serving ad declines to inject itself. While the site is unapproved no ads
 *   serve at all, so "no ad markup found" is weak on its own. The markup
 *   assertions below are written now so they mean something on the re-run
 *   after approval. Re-run this then -- a pass before approval is not the
 *   proof, it is the baseline.
 */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const [tripId, participantCode, adminCode] = process.argv.slice(2);
if (!tripId || !participantCode || !adminCode) {
  console.error('usage: node verify/ads-placement.mjs <tripId> <participantCode> <adminCode>');
  process.exit(2);
}

const BASE = 'https://www.roomselector5000.com';
const SHOT_DIR = new URL('../.tmp-verify/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, {recursive: true});

const DEBUG_TOKEN = process.env.APPCHECK_DEBUG_TOKEN || '';
if (!DEBUG_TOKEN) {
  console.warn('APPCHECK_DEBUG_TOKEN not set — getResults will be rejected and ' +
      'the results cards will not render, which is exactly what this checks.');
}

// Everything AdSense is known to put in a page: the loader, the manual slot
// element, the container Auto ads injects around a placement, and the iframes
// the creative itself lands in.
const AD_MARKUP = [
  'script[src*="googlesyndication"]',
  'script[src*="adsbygoogle"]',
  'ins.adsbygoogle',
  '.adsbygoogle',
  '.google-auto-placed',
  '[data-google-query-id]',
  '[data-ad-client]',
  '[data-ad-slot]',
  'iframe[id^="aswift_"]',
  'iframe[src*="googlesyndication"]',
  'iframe[src*="doubleclick"]',
  'iframe[name^="google_ads"]',
  '#google_esf',
].join(', ');

const LOADER = 'script[src*="adsbygoogle.js"]';

const consoleErrors = [];
const failures = [];
const results = [];

/** @param {string} text @returns {boolean} known headless-only artifact */
function isHeadlessArtifact(text) {
  // Same narrow allowance as e2e-napa-flow.mjs: the reCAPTCHA iframe App Check
  // loads cannot get third-party storage access in headless Chromium.
  if (text.includes('requestStorageAccess: Permission denied')) return true;

  // Chrome reporting that GOOGLE's own report-only CSP was violated by their
  // reCAPTCHA frame. Not ours and not fixable by us: the policy is served by
  // google.com, and "report-only ... no further action has been taken" means
  // nothing was blocked -- App Check tokens still issue, submissions still
  // succeed. Confirmed to come from App Check rather than from ads: it first
  // appeared on /admin, which loads no ad code at all.
  //
  // Matched narrowly ON THE REPORT-ONLY WORDING. If Google ever enforces this
  // policy the message loses "report-only" and stops matching -- which is what
  // should happen, because an enforced frame-ancestors would break reCAPTCHA
  // and take every callable with it. That is a real failure, not noise.
  return text.includes('report-only Content Security Policy') &&
      text.includes('frame-ancestors');
}

const browser = await chromium.launch();

async function newContext(viewport) {
  const ctx = await browser.newContext({colorScheme: 'dark', viewport});
  if (DEBUG_TOKEN) {
    await ctx.addInitScript((t) => {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, DEBUG_TOKEN);
  }
  ctx.on('page', (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isHeadlessArtifact(msg.text())) {
        consoleErrors.push({url: page.url(), text: msg.text()});
      }
    });
    page.on('pageerror', (err) =>
      consoleErrors.push({url: page.url(), text: `pageerror: ${err.message}`}));
  });
  return ctx;
}

function check(label, ok, detail) {
  results.push({label, ok, detail});
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Counts ad markup in the whole document and inside every [data-ad-free]. */
async function scan(page) {
  return page.evaluate((sel) => {
    const doc = [...document.querySelectorAll(sel)].map((el) =>
      el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') +
      (el.className && typeof el.className === 'string' ? `.${el.className.split(' ').join('.')}` : ''));
    const guarded = [];
    for (const region of document.querySelectorAll('[data-ad-free]')) {
      for (const el of region.querySelectorAll(sel)) {
        guarded.push(`${region.getAttribute('data-ad-free')}: ${el.tagName.toLowerCase()}`);
      }
    }
    return {
      doc,
      guarded,
      guardedRegions: [...document.querySelectorAll('[data-ad-free]')]
        .map((r) => r.getAttribute('data-ad-free')),
    };
  }, AD_MARKUP);
}

/**
 * Loads a route, lets any ad script settle, and asserts the expectation.
 * `expectLoader` true means this route is meant to monetize.
 */
async function visit(ctx, {path, label, expectLoader, expectGuard, wait = 'form'}) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${path}`, {waitUntil: 'domcontentloaded'});
  // Auto ads inject asynchronously after the loader executes; a synchronous
  // read right after load would find nothing whether or not the gate works.
  await page.waitForTimeout(4000);
  if (wait) await page.waitForSelector(wait, {timeout: 15000}).catch(() => {});
  await page.waitForTimeout(2000);

  const hasLoader = await page.locator(LOADER).count();
  const scanned = await scan(page);

  check(`${label}: loader ${expectLoader ? 'present' : 'ABSENT'}`,
      expectLoader ? hasLoader > 0 : hasLoader === 0,
      `found ${hasLoader}`);

  if (expectGuard) {
    check(`${label}: [data-ad-free] region rendered`,
        scanned.guardedRegions.includes(expectGuard),
        `regions=[${scanned.guardedRegions.join(',')}]`);
    check(`${label}: zero ad markup inside [data-ad-free]`,
        scanned.guarded.length === 0,
        scanned.guarded.join(', ') || 'clean');
    check(`${label}: zero ad markup anywhere in document`,
        scanned.doc.length === 0,
        scanned.doc.join(', ') || 'clean');
  }

  await page.screenshot({
    path: `${SHOT_DIR}ads-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`,
    fullPage: true,
  });
  return page;
}

for (const [vpName, viewport] of [
  ['mobile-390', {width: 390, height: 844}],
  ['desktop', {width: 1280, height: 900}],
]) {
  console.log(`\n=== ${vpName} (dark) ===`);
  const ctx = await newContext(viewport);

  // Ad-eligible. The loader MUST be here, or the gate is broken shut and the
  // site earns nothing -- a passing "no ads anywhere" run would be worthless.
  await visit(ctx, {path: '/', label: `${vpName} home`, expectLoader: true, wait: null});
  await visit(ctx, {path: '/join', label: `${vpName} join`, expectLoader: true, wait: null});
  await visit(ctx, {path: '/create', label: `${vpName} create`, expectLoader: true, wait: null});

  // Money and fairness UI, loaded directly -- the common case, because trip
  // links arrive by text and results links by email.
  await visit(ctx, {
    path: `/trip/${tripId}`, label: `${vpName} submission`,
    expectLoader: false, expectGuard: 'submission', wait: '[data-ad-free="submission"]',
  });
  await visit(ctx, {
    path: `/results/${tripId}?code=${participantCode}`, label: `${vpName} results`,
    expectLoader: false, expectGuard: 'results', wait: '[data-ad-free="results"]',
  });
  await visit(ctx, {
    path: `/admin/${tripId}?code=${adminCode}`, label: `${vpName} admin`,
    expectLoader: false, expectGuard: 'admin', wait: '[data-ad-free="admin"]',
  });

  // The in-session path: land on an ad-eligible route, let the loader execute,
  // THEN navigate into money UI the way a real person does after joining.
  // This is the case route-gating alone cannot fully guarantee -- once
  // adsbygoogle.js has run, removing its tag does not unload it -- so assert
  // the outcome rather than trusting the mechanism.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/join`, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4000);
  const loaderBefore = await page.locator(LOADER).count();
  check(`${vpName} spa: loader present on /join before navigating`, loaderBefore > 0, `found ${loaderBefore}`);

  await page.goto(`${BASE}/#/trip/${tripId}`, {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('[data-ad-free="submission"]', {timeout: 15000}).catch(() => {});
  await page.waitForTimeout(5000);
  const scanned = await scan(page);
  check(`${vpName} spa: loader removed after navigating into submission`,
      (await page.locator(LOADER).count()) === 0);
  check(`${vpName} spa: zero ad markup inside [data-ad-free] after navigation`,
      scanned.guarded.length === 0, scanned.guarded.join(', ') || 'clean');
  await page.screenshot({path: `${SHOT_DIR}ads-${vpName}-spa-nav.png`, fullPage: true});

  await ctx.close();
}

// ads.txt has to be served as a real file. The hosting rewrite sends "**" to
// index.html, so a missing file would return 200 with HTML -- checking the
// status code alone proves nothing here. Check the body.
const res = await fetch(`${BASE}/ads.txt`);
const body = await res.text();
check('ads.txt served as a real file (not the SPA fallback)',
    res.ok && body.includes('pub-6539967757276332') && !body.includes('<html'),
    `status=${res.status} firstline=${JSON.stringify(body.split('\n').find((l) => l && !l.startsWith('#')) || '')}`);

const meta = await fetch(`${BASE}/`).then((r) => r.text());
check('google-adsense-account meta tag present',
    meta.includes('name="google-adsense-account"') && meta.includes('ca-pub-6539967757276332'));
check('no adsbygoogle.js in the served index.html head',
    !meta.includes('adsbygoogle.js'),
    'a head snippet would put ad code on every route including results');

await browser.close();

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (consoleErrors.length) {
  console.error(`\n${consoleErrors.length} console error(s):`);
  for (const e of consoleErrors) console.error(`  ${e.url}\n    ${e.text}`);
}
if (failures.length || consoleErrors.length) {
  console.error(`\nFAILED: ${failures.length} check(s), ${consoleErrors.length} console error(s)`);
  process.exit(1);
}
console.log('\nPASS — ad code loads only on navigation-boundary routes; money and fairness UI is clean.');
