# Room Selector 5000

**roomselector5000.com** — a fairer way for a group to divide up beds, and what
everyone pays, without anyone feeling outbid.

---

## Operating constraints — non-negotiable

These come from the project owner and override anything else in this file.

1. **Never touch a file outside `/Users/jordanduffey/Desktop/room-selector-project`.**
   No exceptions. Not to "check something," not to install a global tool, not to
   read a config in `~`. If a task seems to require it, skip the task and write
   down why. (Playwright browsers are cached inside the repo:
   `PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright`.)
2. **`git add` and `git commit` often. Never `git push`.** One logical change per
   commit. Pushing is the owner's call, not yours.
3. **Do only the work in this file.** The roadmap below is the whole scope. If you
   finish it, stop and write a summary — do not invent adjacent work.
4. **Never ask for approval.** The owner is asleep; a question is a dead end that
   wastes the entire session. When you hit a genuine fork, pick the option that is
   easiest to reverse, write down the choice and the reasoning, and keep going.
   The only things you must not decide alone are listed under "Do not ship
   unattended."

### Do not ship unattended

- **Anything that deletes production Firestore data** other than documents you
  yourself created with a `[demo]` prefix. (The retention cron in P3 is the
  exception — ship it, but its first unattended run must be a dry run that
  *logs* what it would delete; actual deletion turns on only after the owner
  reviews the log.)
- **DNS or custom-domain changes.** Both hostnames serve valid certs; there is
  nothing left to fix. Leave DNS alone.
- **Signing the owner up for external services.** Brevo/Resend and AdSense
  accounts are the owner's to create; build against env-var credentials and
  leave the slot empty. A missing key must degrade gracefully (log and skip),
  never crash allocation.

---

## Selecta-bot & voice

The product is fronted by **Selecta-bot**, a 1950s-era robot who helps groups
democratize where they sleep. Atomic-age chrome on the outside, thoroughly modern
mechanism design underneath. That contrast is the whole brand: it *looks* like a
midcentury appliance and it *behaves* like current fair-division research.
The design system lives in `tailwind.config.js` (the `selecta` palette) and
`src/components/SelectaBot.jsx` (idle / thinking / done / warning states).

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

## Current state

| Thing | Status |
| --- | --- |
| The app | **Deployed** — https://room-selector.web.app and https://www.roomselector5000.com (both certs valid; apex 301s to `www`) |
| `firestore.rules` (deny-by-default), six callables, hosting from `dist/` | **Deployed**, verified end to end in production |
| `allocateRooms` | **Envy-free allocator**, proven in production on a discriminating input (2026-07-28) |
| Couples | Mutual `partnerEmail` confirmation. The `+copy` hack no longer forms couples. |
| Design system | Selecta-bot (cream/teal/coral, bot states), all six views verified at 390px, dark mode, zero console errors |
| Test harnesses | `verify/e2e-napa-flow.mjs` (production e2e; `--discriminating` proves which allocator is live), `verify/regression-envyfree.cjs` (18/18 vs reference), `verify/simulate-envyfree.cjs` (576 trips, zero envy — results in `verify/simulation-results.md`) |
| Email | **None.** Anyone can submit as any address; results are hand-delivered. P1 fixes both. |
| Trip dates | **Not collected.** Blocks retention (P3). |
| App Check / privacy policy / ads | None yet — P2. |

Deploy note: **rules, functions, and client must deploy together**
(`firebase deploy --only firestore,functions,hosting`, after `npm run build`).
Any two without the third is a broken app.

Production failure modes already hit, worth remembering:
- A 2nd-gen callable whose first deploy fails an IAM propagation race stays
  **403 Forbidden** — delete the function and deploy it fresh; a redeploy does
  not add the public-invoker binding.
- `vite.config.js` `base` must stay `/`, or the SPA rewrite serves `index.html`
  for every asset: blank page, no console error.
- Every production bug so far returned HTTP 200 and logged nothing. Verify in a
  real browser, dark mode, asserting zero console errors.

### Shipped (July 2026) — do not redo

Envy-free allocator ported to `functions/allocation.js` and deployed;
mutual-confirmation couples (P1.2-old); simulation harness with committed
results; Selecta-bot design pass, mobile-first; results-page crash fix
(`stats` was never defined — results had never rendered in production);
`seed --clean` now removes the full cascade including assignments; both
custom-domain certs live. Proofs live in `verify/`; theory in
`ARCHITECTURE.md`; decisions in `docs/drafts/`.

---

## Conventions

- **Security invariant.** A client must *never* be able to read a document
  containing `adminCode`, `participantCode`, or an email address. Firestore cannot
  filter fields on a read, which is why trip codes live in `trips/{id}/secret/codes`.
  Add an explicit deny block rather than loosening an existing rule.
- **Lint gates deploy.** `firebase.json` runs `npm --prefix functions run lint` as a
  `predeploy` hook.
- **Commits** explain *why*, not just what. Include measured results when a change is
  justified by them.
- **Verify, don't assert.** Run it and check the output — in a browser, dark mode,
  zero console errors, at 390px as well as desktop.
- **Clean up test data.** Prefix everything you create with `[demo]` so
  `node seed/seed-demo-trips.js --clean` removes it. Always `--clean` before
  reseeding — running seed twice creates duplicate fixtures.
- `seed/v1-archive/` is **frozen**. Do not modify it. Never commit
  `seed/serviceAccountKey.json`.

---

## Roadmap — next pass

### P1 — Email: verification + the one non-optional notification

**Decided 2026-07-28: Option A** of `docs/drafts/P1.1-magic-link-auth.md` —
trip codes keep gating access; auth binds identity at the moment of
submission. That draft is now the implementation reference.

**1.1 Magic-link auth.** Firebase Auth email-link sign-in. **Sender decided
2026-07-28: launch with the default** `noreply@room-selector.firebaseapp.com`
(Google-reputation deliverability, zero DNS). The *links inside* the email
use `www.roomselector5000.com` — the hosting domain already serves the
`/__/auth/action` handler; set `actionCodeSettings.url` to it and add the
domain to Auth's authorized domains. `submitPreferences` requires
`request.auth` and takes the email from the verified token. Enforce for new
submissions only; do not invalidate existing trips.

**1.3 Custom sender domain — parked, owner-triggered.** Later, one
deliberate DNS session (owner adds Brevo's SPF/DKIM + verification records
at the registrar — additive TXT/CNAMEs, no risk to the site's A records)
flips *both* streams to `noreply@roomselector5000.com`: auth emails via
Firebase Auth's custom-SMTP setting pointed at Brevo, results emails already
on Brevo. **Never half-configure this**: a custom sender without verified
SPF/DKIM lands in spam, and a spam-foldered magic link is a locked-out
user. Default sender until the DNS work is done, then fully verified —
nothing in between.

**1.2 Results email at finalization.** Without it the organizer hand-delivers
results to 18 people. Send from `allocateRooms` after the batch commits, via a
free-tier transactional provider's HTTP API — **Brevo** (300/day free) by
default, Resend as alternate. API key from an env var / functions secret; if
the key is absent, log and skip — **email failure must never fail an
allocation**. Do **not** use the "Trigger Email" Firebase extension: Firebase
Extensions is deprecated and shuts down March 2027.

Content rules: the results email states each recipient's bed and exact dollar
figure literally (voice rules apply in full). Include the results link and
trip code.

Harness note: production e2e cannot click emailed links. Per the draft: use
`FIREBASE_AUTH_EMULATOR_HOST` for local runs, and pick one of the two
production-e2e strategies in the draft when wiring enforcement.

> **Acceptance:** a submission without a verified session is rejected by the
> callable (not just the UI); finalizing a trip emails every participant
> their own assignment; allocation still succeeds with no email key present.

### P2 — Legal + revenue

**2.1 Privacy policy + terms.** Static routes, plain language. Legally
required (emails are collected from the public) and AdSense will not approve
without it. Must state: what is collected (emails, bids, preferences), the
**6-month retention rule from P3**, that ads are served, and a contact route.

**2.2 AdSense — Auto ads, vignettes only.** Owner decision: monetize
navigation boundaries (after creating a trip, after joining), keep the pages
themselves bespoke. Enable Auto ads with the vignette format on and in-page /
anchored formats off.

> **Ad constraints — hard:**
> - **No forced-countdown or non-dismissible ads.** That format belongs to
>   mobile apps (AdMob); on the web it violates the Better Ads Standards and
>   Chrome penalizes the whole site for it, up to stripping all ads.
> - **No ads inside money or fairness UI.** Nothing between a person and the
>   number they pay. Results assignments, price balance, and bid controls
>   stay ad-free.

**2.3 App Check.** Trip creation is unauthenticated and spammable, and ads
will invite traffic. reCAPTCHA v3 provider on the six callables.

> **Acceptance:** privacy/terms routes live and linked from every page
> footer; a raw `curl` to `createTrip` is rejected by App Check; vignettes
> appear at navigation points only (verify no ad markup renders inside the
> submission form or results cards).

### P3 — Data lifecycle (retention)

Owner decision: **trip data is deleted 6 months after the trip ends.**

- Create form gains start/end dates (`endDate` on the trip doc). Dates also
  unblock future lifecycle UX ("trip is over" states).
- Monthly scheduled function (v2 `onSchedule`) deletes every trip where
  `endDate + 6 months < now` — full cascade: trip, rooms, submissions,
  assignments, `secret/codes`, `codes/{code}` reverse lookups. Undated legacy
  trips: `createdAt + 12 months`. `[demo]` fixtures exempt.
- **Factor the cascade delete into one shared module** used by the cron, the
  seed script's `--clean` (which already implements the full cascade —
  extract, don't duplicate), and P4's delete-trip callable.
- First unattended run is a **dry run that logs** candidates; see "Do not
  ship unattended."
- P2.1's privacy policy states this rule.

> **Acceptance:** dry-run log lists exactly the expired trips and nothing
> else; a `[demo]` trip with a backdated `endDate` is deleted by the cron in
> a supervised run; privacy policy wording matches the implemented rule.

### P4 — Trip lifecycle

No way today to edit a trip, remove a participant, or reopen a finalized
one. The first support request will be exactly this. Admin-code-gated
callables plus dashboard UI:

- **Edit trip/rooms** while no submissions exist (name, cost, beds).
- **Close submissions** without allocating (status `closed`).
- **Remove one submission** (mistake, duplicate, dropout) — must also clear
  any `partnerEmail` reference pointing at it.
- **Reopen a finalized trip** — deletes assignments, reverts status to
  collecting, so the organizer can rerun after a change.
- **Delete trip** — full cascade via the P3 shared module.

> **Acceptance:** each operation exercised through the dashboard on a
> `[demo]` trip in production; reopening then re-allocating produces a
> fresh, envy-free result; none of these callables work with a participant
> code.

---

## Later (parked — constraints still bind)

- **Listing import.** Organizer pastes listing *text*; an LLM pre-fills the
  create form; the organizer always reviews before submit. Deliberately
  paste-not-scrape: URL scraping violates Airbnb ToS, fights bot detection,
  and gets Cloud Function IPs blocked. An ad vignette may precede the AI
  call to offset its (small) cost.
- **Drag-rank + AI assist.** The assist helps someone *express what they
  actually want*. It must never help them *win*: the mechanism is not
  strategyproof, and coaching bid-shading would break the exact property
  the product sells. If a user asks how to game it, the honest answer is
  that bidding true values is what makes the result defensible.
- **Equal-budget bidding** (the real answer to wealth leaking into
  allocations, and to manipulation among strangers) and a pro tier.
- **Small polish, grab when touching the client:** replace the default Vite
  favicon (`index.html` still points at `/vite.svg`) with a Selecta-bot head
  SVG; custom sender domain (P1.3 above) once the owner does the DNS session.

---

## Session wind-down — do this automatically at the end of every thread

When a working session is wrapping up (roadmap section done, context running
long, or the owner says they're switching agents), run this checklist without
being asked. A session isn't finished until its hand-off is.

1. **Reality-sync this file.** Current-state table, roadmap (move shipped
   items to Shipped, promote any decisions made mid-thread from "options"
   to "decided" with the date), and the do-not-ship list.
2. **Docs sweep — does anything now lie?** README.md, ARCHITECTURE.md, and
   `docs/drafts/*` are checked against what actually shipped. (Lesson: the
   README said "not launch-ready, hosting points at a placeholder" for weeks
   after launch.)
3. **Restore fixtures.** `seed/seed-demo-trips.js --clean` then reseed once;
   confirm no stray `[demo]` data or orphaned collections remain.
4. **Run the verify suite** relevant to what changed (`verify/*`); measured
   results go in commit messages.
5. **Commit everything** in logical units. Never push.
6. **Write the hand-off summary**: shipped / verified-how / blocked-on-what /
   decisions the owner still owes. If a durable convention emerged, save it
   to agent memory too.

---

## Start here (autonomous session)

Work in this order: **P1.1 + 1.2 → P2.1 → P2.3 → P3 → P4.**
(P2.2 AdSense needs the owner's AdSense account — build the vignette config
and footer links, but actual ad serving waits for the owner.)

Rules of engagement while unattended:

- **Deploy freely, but never partially** (build first; rules + functions +
  hosting together).
- **Verify in a browser, not by reading** — dark mode, 390px and desktop,
  zero console errors. `verify/e2e-napa-flow.mjs` is the template.
- **Clean up test data**; the three `[demo]` trips are intentional fixtures.
- **Commit as you go.** Do not push.

---

## Verification

```bash
npm run build                      # client
npm --prefix functions run lint    # gates deploy
node seed/seed-demo-trips.js       # fixtures; --clean first to avoid dupes
node verify/regression-envyfree.cjs
node verify/simulate-envyfree.cjs
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>
```

---

## Out of scope

**No Terraform.** `firebase.json`, `firestore.rules`, and
`firestore.indexes.json` *are* the IaC. **No user-account system** beyond
magic-link identity binding — codes remain the access model.
