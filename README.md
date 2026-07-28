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

Open **http://localhost:5173/room-selector/** — the `/room-selector/` path
matters, it comes from `base` in `vite.config.js`. Routing is `HashRouter`, so
pages look like `#/create`.

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

```bash
npm run build
firebase deploy
```

> **Not launch-ready.** `firebase.json` points hosting at `hosting-placeholder/`
> deliberately. The six components still read Firestore directly, which the
> current rules forbid, so the client refactor has to land before hosting can be
> flipped to `dist/`.

Requires the Blaze plan — Cloud Functions need it. A $5 budget alert is
configured, but **GCP budgets only alert, they never cap spend**. The real
ceiling is `maxInstances` on each callable.

## Layout

```
src/
  components/            HomePage, TripCreator, TripJoin,
                         SubmissionForm, AdminDashboard, ResultsView
  firebase.js            client config — the only one, don't add a second
functions/               callable functions: all writes, all sensitive reads
seed/
  allocate-envyfree.js   current allocator
  v1-archive/            frozen — how the January 2026 trip actually ran
firestore.rules          deny-by-default; the whole security model
```

## Docs

**`ARCHITECTURE.md`** — data model, security model, and how the allocation
mechanism works and why it's built that way.
