# Room Selector 5000

A fairer way for a group to divide up beds — and what everyone pays — without
anyone feeling outbid.

One person creates a trip and lists the beds. Everyone else opens a link, ranks
the beds they'd genuinely accept, and nudges prices up or down (their
adjustments must sum to zero). The allocator then assigns beds and sets prices
so that **nobody prefers anyone else's bed at its price**.

That property is the point. It means "I got outbid" has an answer: you were
offered that bed at that price, and you preferred the money.

No accounts. Access is by code — and since August 2026, submitting also
requires confirming your email address once, so a ballot can't be forged or
cast twice. That's a one-time click, not a login: there's still nothing to
sign up for.

## Run it locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Routing is `HashRouter`, so pages look
like `#/create`.

Firebase config lives in `src/firebase.js`. It is **not** a secret: the `apiKey`
there is an identifier that ships in the bundle of every Firebase web app and
grants nothing by itself. Access control is entirely in `firestore.rules`.

## Reproducing the allocator comparison

```bash
cd seed
node v1-archive/allocate-beds.js submissions-full18.csv   # v1 baseline
node allocate-envyfree.js submissions-export.json         # current
```

Run against the 18 real submissions from the January 2026 trip. See
`ARCHITECTURE.md` for what changed and by how much.

## Deploying

**Live:** https://www.roomselector5000.com (and https://room-selector.web.app).

```bash
npm run build
firebase deploy --only firestore,functions,hosting
```

Rules, functions, and hosting must ship together — any two without the third
is a broken app. Build first, or hosting serves a stale bundle.

`--only hosting` is defensible for a change that touches no callable signature
and no rule (the AdSense work in August 2026 was one). The reason for the
three-together rule is skew — a client calling a callable it does not have, or
reading a document the rules deny — so if there is no skew to create, there is
nothing to break. Say why in the commit rather than doing it silently.

Requires the Blaze plan — Cloud Functions need it. A $5 budget alert is
configured, but **GCP budgets only alert, they never cap spend**. The real
ceiling is `maxInstances` on each callable.

## Verifying

```bash
node verify/regression-envyfree.cjs    # port matches the reference, 18/18
node verify/simulate-envyfree.cjs      # 576 synthetic trips, zero envy
node verify/preview-results-email.cjs  # renders the results email, offline

# Extraction quality + cost. --sweep compares models on the same listing.
ANTHROPIC_API_KEY=$(firebase functions:secrets:access ANTHROPIC_API_KEY) \
  node verify/preview-listing-import.cjs [file.pdf] [--sweep]

# Production e2e. APPCHECK_DEBUG_TOKEN is REQUIRED since App Check was
# enforced — without it every submission is rejected and the run fails.
APPCHECK_DEBUG_TOKEN=<registered debug token> \
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>

# Ads land only at navigation boundaries, never in money or fairness UI.
# Needs a FINALIZED trip, or the results cards it checks never render.
APPCHECK_DEBUG_TOKEN=<registered debug token> \
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/ads-placement.mjs <tripId> <participantCode> <adminCode>

# Trip lifecycle (P4): edit-trip form, and reopen -> re-allocate staying
# envy-free. First trip must have NO submissions, second must be finalized.
APPCHECK_DEBUG_TOKEN=<registered debug token> \
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/p4-lifecycle.mjs <editTripId> <editAdminCode> \
                               <allocTripId> <allocAdminCode>
```

The e2e drives the deployed site in a dark-mode browser and fails on any
console error; codes come from `node seed/seed-demo-trips.js`
(`--clean` first, or you get duplicate fixtures). Pass `--discriminating` to
prove which allocator is deployed — v1 and envy-free price near-uniform bids
identically.

**On the debug token:** App Check runs reCAPTCHA v3, which scores a headless
browser far below the passing threshold — so the tool this repo verifies
everything with is exactly what App Check exists to reject. A registered debug
token is the supported way through. It bypasses App Check for whoever holds it,
so it lives in the environment and is never committed.

`preview-results-email.cjs --send <address>` posts one real message through
Brevo, which is the only way to prove the sender domain is authenticated.

### Local stack (email verification)

Magic-link sign-in cannot be exercised against production — nothing can click
a link in a real inbox. These run against the emulators, which expose
generated links over HTTP. The Firestore emulator needs Java on `PATH`
(`brew install openjdk@21`, then
`export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`):

```bash
firebase emulators:start --only auth,firestore,functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed-demo-trips.js
VITE_USE_EMULATOR=true VITE_AUTH_EMULATOR=true npm run dev -- --port 5173

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  node verify/local-auth-enforcement.mjs   # callable rejects unverified
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/local-magiclink-flow.mjs     # full journey, 390px + desktop
```

Firestore must point at the emulator whenever Auth does: a browser signed in
against the Auth emulator holds a token signed `alg: none`, which production
Firestore correctly refuses.

## Layout

```
src/
  components/            HomePage, TripCreator, TripJoin, SubmissionForm,
                         AdminDashboard, ResultsView, SelectaBot
                         Footer, LegalPages (privacy + terms)
  firebase.js            client config — the only one, don't add a second
  auth.js                magic-link sign-in + the stashed submission
  appcheck.js            App Check init; no-op without a site key
  ads.js                 AdSense loader, allowlisted to navigation-boundary
                         routes — money and fairness UI never loads ad code
functions/
  allocation.js          the envy-free allocator (production)
  email.js               results email via Brevo; never fails an allocation
  listing-import.js      Claude extraction for the create form; degrades to off
  trip-cascade.js        one cascade delete, shared by cron/seed/deleteTrip
  index.js               callable functions: all writes, all sensitive reads
seed/
  allocate-envyfree.js   reference implementation of the allocator
  v1-archive/            frozen — how the January 2026 trip actually ran
verify/                  e2e, regression, and simulation harnesses + results
  envy-audit.cjs         the independent envy check, shared by the simulation
                         and the lifecycle harness
docs/drafts/             decision docs (magic-link auth, AdSense settings)
public/ads.txt           copied to the dist root by Vite; AdSense reads it
                         at /ads.txt
firestore.rules          deny-by-default; the whole security model
```

## Docs

**`ARCHITECTURE.md`** — data model, security model, and how the allocation
mechanism works and why it's built that way.
