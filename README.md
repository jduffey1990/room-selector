# Room Selector 5000

A fairer way for a group to divide up beds — and what everyone pays — without
anyone feeling outbid.

One person creates a trip and lists the beds. Everyone else opens a link, ranks
the beds they'd genuinely accept, and nudges prices up or down (their
adjustments must sum to zero). The allocator then assigns beds and sets prices
so that **nobody prefers anyone else's bed at its price**.

That property is the point. It means "I got outbid" has an answer: you were
offered that bed at that price, and you preferred the money.

No accounts. Access is by code.

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

Requires the Blaze plan — Cloud Functions need it. A $5 budget alert is
configured, but **GCP budgets only alert, they never cap spend**. The real
ceiling is `maxInstances` on each callable.

## Verifying

```bash
node verify/regression-envyfree.cjs    # port matches the reference, 18/18
node verify/simulate-envyfree.cjs      # 576 synthetic trips, zero envy
node verify/preview-results-email.cjs  # renders the results email, offline
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>
```

The e2e drives the deployed site in a dark-mode browser and fails on any
console error; codes come from `node seed/seed-demo-trips.js`
(`--clean` first). Pass `--discriminating` to prove which allocator is
deployed — v1 and envy-free price near-uniform bids identically.

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
  firebase.js            client config — the only one, don't add a second
  auth.js                magic-link sign-in + the stashed submission
functions/
  allocation.js          the envy-free allocator (production)
  email.js               results email via Brevo; never fails an allocation
  index.js               callable functions: all writes, all sensitive reads
seed/
  allocate-envyfree.js   reference implementation of the allocator
  v1-archive/            frozen — how the January 2026 trip actually ran
verify/                  e2e, regression, and simulation harnesses + results
docs/drafts/             decision docs (magic-link auth)
firestore.rules          deny-by-default; the whole security model
```

## Docs

**`ARCHITECTURE.md`** — data model, security model, and how the allocation
mechanism works and why it's built that way.
