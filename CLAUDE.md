# Room Selector 5000

**roomselector5000.com** — a fairer way for a group to divide up beds, and what
everyone pays, without anyone feeling outbid.

---

## Selecta-bot & voice

The product is fronted by **Selecta-bot**, a 1950s-era robot who helps groups
democratize where they sleep. Atomic-age chrome on the outside, thoroughly modern
mechanism design underneath. That contrast is the whole brand: it *looks* like a
midcentury appliance and it *behaves* like current fair-division research.

Voice rules:

- Warm and brisk. Selecta-bot is helpful and a little formal, never smarmy.
- **Never cute at the expense of clarity.** Retro flourish belongs in headings,
  empty states, and loading copy — not in anything about money, fairness, or what a
  person is agreeing to.
- Dollar figures, price rules, and fairness claims are stated literally. "You pay
  $612.40" never becomes "Selecta-bot has calculated your atomic share!"
- Errors are plain and actionable. A robot persona is not an excuse for a vague
  failure message.

---

## What this is

One person creates a trip and lists the beds. Everyone else opens a link, ranks the
beds they'd genuinely accept, and nudges prices up or down (adjustments must sum to
zero). The allocator then assigns beds and sets prices so that **nobody prefers
anyone else's bed at its price**.

That property — envy-freeness — is the product. It means "I got outbid" has an
answer: *you were offered it at that price and preferred the money.*

Read `ARCHITECTURE.md` for the mechanism, the theory it rests on, and its known
limits. Do not restate that content here.

---

## Current state — read this before assuming anything works

| Thing | Status |
| --- | --- |
| The app | **Deployed** — https://room-selector.web.app |
| `firestore.rules` (deny-by-default) | **Deployed** |
| Six callables | **Deployed**, verified end to end against production |
| `allocateRooms` | Deployed, but still runs the **v1 heuristic**, not envy-free |
| Client | On the callables. Only `trips`/`rooms` are read directly. |
| Hosting | Serving the real app from `dist/` |
| `roomselector5000.com` | Apex cert valid, but **redirects to `www`, which has no cert** — see P0.1 |
| Envy-free allocator | `seed/allocate-envyfree.js`, CLI only. Not yet in `functions/`. |
| Email verification | **None.** Anyone can submit as any address. See P1.1. |

Deploy note: **rules, functions, and client must deploy together.** Any two
without the third is a broken app.

Two production-only failure modes already hit once, worth remembering:
- A 2nd-gen callable whose first deploy fails an IAM propagation race stays
  **403 Forbidden** — a redeploy only *updates* it and does not add the public
  invoker binding. Delete the function and deploy it fresh.
- `vite.config.js` `base` must stay `/`. Setting it to a subpath makes the
  hosting SPA rewrite swallow every asset request and serve `index.html`
  instead, which renders a blank page with no console error.

---

## Conventions

- **Security invariant.** A client must *never* be able to read a document
  containing `adminCode`, `participantCode`, or an email address. Firestore cannot
  filter fields on a read, which is why trip codes live in `trips/{id}/secret/codes`.
  Add an explicit deny block rather than loosening an existing rule.
- **Lint gates deploy.** `firebase.json` runs `npm --prefix functions run lint` as a
  `predeploy` hook. A lint error blocks every function deploy.
- **Commits** explain *why*, not just what. Include measured results when a change is
  justified by them.
- **Verify, don't assert.** This codebase has a habit of things that look right and
  aren't — a `package.json` reduced to one dependency, prices decoupled from bids, a
  cert that exists for the apex but not `www`. Run it and check the output.
- `seed/v1-archive/` is **frozen**. It is the record of the January 2026 trip and the
  A/B baseline. Do not modify it.

---

## Roadmap

### P0 — Deployment

**0.1 Add the `www` custom domain** — *STILL OPEN, user action, ~5 min, Firebase
console.* The apex has a valid cert, but it 301-redirects to `www`, and
`www.roomselector5000.com` was never registered — so Firebase serves its default
`firebaseapp.com` cert there, producing `ERR_CERT_COMMON_NAME_INVALID`. Until this
is done the custom domain is unusable; `https://room-selector.web.app` works.

**0.2 Client onto callables** — DONE.
**0.3 Deploy rules + functions + hosting** — DONE.
**0.4 Hosting serving `dist/`** — DONE.

Verified in production: create → participant view → admin, with correct
per-person math and zero console errors. A wrong admin code shows the unlock
prompt and leaks nothing on a fresh load.

**Not yet exercised in production:** `submitPreferences` and `allocateRooms`
through the UI. The callables were verified against the emulator over real
Firestore, but no trip has been allocated end to end on the deployed stack.

---

### P1 — Integrity. Required before strangers touch it

**1.1 Magic-link email verification.** Right now *anyone can submit as any email
address*, or as five addresses. Impersonation and ballot-stuffing both work, which
undercuts the entire fairness claim. Use Firebase Auth passwordless email links and
bind each submission to a verified address. This also builds the channel P4 needs to
deliver results.

**1.2 Kill the `+copy` couples hack.** `functions/allocation.js:117` detects couples
by string-parsing `you+copy@gmail.com`. Defensible among 18 friends who were told the
trick; absurd for strangers. Replace with an explicit "I'm sharing a bed with…" flow
requiring **both** participants to confirm.

**1.3 Firebase App Check.** Trip creation is unauthenticated and spammable.

**1.4 Privacy policy + terms.** Legally required — you collect emails from the
public — and AdSense will not approve without it. Static routes.

> **Acceptance:** a submission from an unverified address is rejected; a couple forms
> only on mutual confirmation; App Check blocks a raw `curl` to `createTrip`.

---

### P2 — Correctness of the thing being sold

**2.1 Port the envy-free allocator into `functions/allocation.js`.**
`seed/allocate-envyfree.js` is the reference implementation. `allocation.js` was
deliberately split out so it is the *only* file that has to change — keep the
`computeAllocation(roomDocs, submissionDocs)` signature.

**2.2 Build a simulation harness.** The algorithm has been A/B'd against exactly one
real trip. Generate synthetic populations varying group size, couple ratio, bed price
spread, preference correlation, and bid noise. Report envy rate, welfare, worst-off
surplus, and price spread across hundreds of scenarios. This is what turns "it worked
once" into a claim you can defend to a stranger.

> **Acceptance:** ≥500 synthetic trips, **zero** envy violations in every one, results
> table committed.

---

### P3 — The product

**3.1 Listing import.** Organizer pastes the *text* of an Airbnb/VRBO/Booking listing
(Cmd-A, Cmd-C); an LLM extracts total price, bed configuration, and sleeps-N to
pre-fill the create form. **Never auto-submit — the organizer reviews and confirms.**

Deliberately *not* URL scraping: Airbnb's ToS prohibits it, their pages are
JS-rendered behind aggressive bot detection, and a Cloud Function IP gets blocked
fast. Pasting works identically across every site, needs no proxy, and carries no ToS
exposure.

**3.2 Selecta-bot design system.** Retro-futurist palette, atomic-age motifs, a bot
character with a few states (thinking, done, warning). Must survive the mobile pass.

**3.3 Voting UX + AI assist.** Replace the chevron reordering in `SubmissionForm` with
drag-rank.

> **Hard constraint on the AI assist:** it helps someone *express what they actually
> want*. It must never help them *win*. The mechanism is **not strategyproof** — an
> assistant that coaches people to shade their bids would break the exact fairness
> property this product sells. If a user asks how to game it, the honest answer is
> that bidding your true values is what makes the result defensible.

---

### P4 — Deliberately later

Ads (needs 1.4 first), pro tier, equal-budget bidding.

---

## Must-haves that are easy to miss

**One notification is not optional.** Everything else can wait, but an email at
finalization can't — without it the organizer hand-delivers results to 18 people. 1.1
already builds the channel; use it.

**Mobile-first.** Organizers create on a laptop; participants rank on a phone, from a
group chat. The UI has never been checked below 1280px. Assume it's broken.

**Manipulation resistance changes with strangers.** "Friends won't game it" was a
reasonable argument for one trip among people who know each other. It dies publicly.
This is the strongest case for equal-budget bidding, and a reason to keep bids private
from other participants.

**Trip lifecycle doesn't exist.** No way to edit a trip, remove a participant, or
reopen a finalized one. The first support request will be exactly this.

---

## Verification

```bash
npm run build                      # client
npm --prefix functions run lint    # gates deploy
node seed/seed-demo-trips.js       # fixtures; --clean to remove
```

Drive the real flows with Playwright in a **dark-mode** browser context asserting zero
console errors — dark mode has already caught one unreadable-input bug that light mode
hid. Then confirm both hostnames serve a cert whose SAN actually covers them:

```bash
curl -sI https://roomselector5000.com
curl -sI https://www.roomselector5000.com
```

---

## Out of scope

**No Terraform.** `firebase.json`, `firestore.rules`, and `firestore.indexes.json`
*are* the IaC — declarative, in git, applied by `firebase deploy`. Adding Terraform
would mean managing GCP resources Firebase already manages.
