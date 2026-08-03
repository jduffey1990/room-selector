# Room Selector 5000

**roomselector5000.com** — a fairer way for a group to divide up beds, and what
everyone pays, without anyone feeling outbid.

---

## Operating constraints — non-negotiable

These come from the project owner and override anything else in this file.

1. **Unattended sessions: never touch a file outside
   `/Users/jordanduffey/Desktop/room-selector-project`.** This is containment
   for work done while the owner is asleep, not a permanent rule — when the
   owner is actively overseeing, they can lift it (they did on 2026-07-29 to
   allow `brew install openjdk@21`, which the Firestore emulator needs).
   Unattended, the rule stands: not to "check something," not to install a
   global tool, not to read a config in `~`. If a task seems to require it,
   skip the task and write down why. (Playwright browsers are cached inside
   the repo: `PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright`.)
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
| `firestore.rules` (deny-by-default), callables, hosting from `dist/` | **12 callables deployed** + the `purgeExpiredTrips` schedule, verified end to end in production. **A 13th, `listParticipantNames` (P5.2), is committed but NOT deployed.** (This row said "seven" until 2026-08-03 — it had never been updated for P4's five admin callables. Count with `grep -c "onCall(" functions/index.js` rather than trusting prose.) |
| `allocateRooms` | **Envy-free allocator**, proven in production on a discriminating input (2026-07-28) |
| Couples | Mutual confirmation, **selected by name since P5.2 — a participant never types an email address.** `partnerEmail` remains the stored field and the only one allocation and the auditor read; it is now *derived* by `functions/couples.js` from a dropdown pick or a typed name claim. The `+copy` hack no longer forms couples. |
| Design system | Selecta-bot (cream/teal/coral, bot states), all six views verified at 390px, dark mode, zero console errors |
| Test harnesses | `verify/e2e-napa-flow.mjs` (production e2e; `--discriminating` proves which allocator is live), `verify/ads-placement.mjs` (P2.2 negative), `verify/p4-lifecycle.mjs` (edit form + reopen→re-allocate), `verify/regression-envyfree.cjs` (18/18 vs reference), `verify/simulate-envyfree.cjs` (576 trips, zero envy — results in `verify/simulation-results.md`), `verify/envy-audit.cjs` (the shared independent envy check), `verify/preview-results-email.cjs` (email rendering; `--send` posts one real message), `verify/local-auth-enforcement.mjs` + `verify/local-magiclink-flow.mjs` (emulator-only; see README "Local stack"), and the P5 set: `verify/p5-couples.cjs` (pairing logic, no browser), `verify/p5-ranking.mjs`, `verify/p5-guidance.mjs`, `verify/p5-partner-ui.mjs`. **`local-auth-enforcement` and `local-magiclink-flow` are currently RED and were before P5** — see "Known red" below. |
| Firebase Auth | **Enabled 2026-08-03** (owner, via Cloud Shell — see P1.1). Email/Password + passwordless on; both `roomselector5000.com` hostnames in `authorizedDomains`. Legacy Firebase Auth, not Identity Platform. |
| Email | **DEPLOYED 2026-08-03.** Magic-link verification enforced (`submitPreferences` returns 401 to an unauthenticated `curl`, verified in production), results email sends at finalization. Auth email goes via Brevo from `noreply@roomselector5000.com` and **lands in the inbox** — P1.4 resolved. |
| Listing import | **DEPLOYED 2026-08-03.** `extractListing` (7th callable) on `claude-haiku-4-5`, ~$0.0026/call. Verified end to end in production: pasted listing → populated create form, 3.3s mobile / 4.8s desktop, zero console errors. |
| Trip lifecycle (P4) | **COMPLETE 2026-08-03.** Five admin-gated callables, all reachable from the dashboard including the `updateTrip` edit form. Both former gaps closed and verified in production by `verify/p4-lifecycle.mjs` (25/25): the edit form persists and refuses once anyone has submitted; reopen → re-allocate yields a fresh **envy-free** result (envyPairs=0, maxEnvy=0, budget error 0). |
| Trip dates | **Collected 2026-08-03** (optional `startDate`/`endDate`, YYYY-MM-DD strings on the trip doc). |
| Retention (P3) | **Cron deployed, DRY RUN.** `purgeExpiredTrips`, monthly 09:00 UTC on the 1st. Deletes nothing until `RETENTION_ENABLED=true`. Cascade extracted to `functions/trip-cascade.js` and shared with `seed --clean`. |
| Privacy policy + terms | **DEPLOYED 2026-08-03** (P2.1). `/#/privacy` and `/#/terms`, linked from a footer on every route. **Two open obligations: `privacy@roomselector5000.com` must route to a real inbox, and the policy promises 6-month deletion that P3 has not implemented yet.** |
| App Check | **ENFORCED 2026-08-03** (P2.3) on every callable except `getResults`, via classic reCAPTCHA v3 — `listParticipantNames` included, from its first deploy. `getResults` deliberately open — it is opened from the results email, often days later in a mail client's in-app browser where reCAPTCHA scores poorly, and blocking someone from seeing what they owe is worse than a scraper reading an already-shared page. Raw `curl` → 401 on the six, 400 on `getResults`. **The e2e harness needs `APPCHECK_DEBUG_TOKEN` (registered debug token, never committed) or every submission is rejected.** |
| Ads | **Code shipped 2026-08-03 (P2.2).** Verification meta tag + `public/ads.txt` live; `src/ads.js` allowlists the AdSense loader to `/`, `/create`, `/join`, `/privacy`, `/terms`. Money and fairness UI never loads ad code — proven by `verify/ads-placement.mjs`, 39/39. **No ads serve yet:** the site is still "needs review", and the Auto ads format toggles are AdSense-UI only (owner). See `docs/drafts/P2.2-adsense-settings.md`. |

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
- **`verify/e2e-napa-flow.mjs` binds to the submission form by position and by
  exact button text**, so a copy change breaks the harness rather than the app.
  It fills the partner field as `input[type="email"]).nth(1)`
  ([line 175](verify/e2e-napa-flow.mjs#L175)) and clicks `text-is("Add to
  Preferences")`, `text-is("+ Show Price Adjustment")`, `text-is("− Hide Price
  Adjustment")`, `text-is("Submit Preferences")` — and waits on the literal
  string `Perfect! Your adjustments sum to zero.` All of P5 touches these. A
  first-run dialog breaks it harder: the harness opens a **fresh browser
  context per participant**, so `localStorage` is always empty and the dialog
  is always up. Update the harness in the same commit as the UI, and prefer
  `data-testid` over copy for anything P5 adds. **Done as of `29233f2`** — the
  partner field is now `[data-testid="partner-select"]`, the name field
  `[data-testid="display-name"]`, and the first-run dialog is marked seen via
  `addInitScript` in every harness that drives the form.
- **A first-run modal breaks every harness that opens a fresh context**, which
  is all of them, because Playwright storage starts empty each time. Symptom
  is a click timing out on a control that is plainly visible in a screenshot —
  the overlay is on top of it. Set the localStorage key in `addInitScript`
  rather than clicking the dialog away per page.

### Shipped (2026-08-03, third session) — P5 complete, NOT DEPLOYED

All four P5 items are built, committed and verified locally. **Nothing is
deployed** — the owner holds that call, and their own trip is the first real
use of this. Deploy is `npm run build && firebase deploy --only
firestore,functions,hosting`, all three together.

| Item | Commit | Verified |
| --- | --- | --- |
| 5.1 import copy, URL guard, `importNotes` | `f1acdb8` | 8/8 URL discrimination |
| 5.4 drag to rank | `56132b2` | 23/23 at 390px + desktop |
| 5.3 explainer + tooltips + scenes | `d57334d` | 30/30 at 390px + desktop |
| 5.2 pairing, server | `c076269` | 30/30 pairing logic |
| 5.2 pairing, client | `29233f2` | 21/21 partner UI |

**The design's central claim held, and this is the evidence:**
`verify/regression-envyfree.cjs` still passes 18/18 against the reference
implementation, **completely unmodified**. Pairing changed shape on the wire
(names and opaque ids) and did not change in storage (`partnerEmail`), so
`functions/allocation.js` and `verify/envy-audit.cjs` never had to move. If a
future change makes either of those files need edits to support pairing, that
is the signal the invariant has been broken.

Worth not relearning:

- **`setPointerCapture` delivered `pointerdown` and then no moves at all**, so
  every drag ended where it started. There is no error, and a no-op reorder is
  indistinguishable from a deliberate one. Window listeners are the fix, and
  they also handle the real-world case: a thumb sliding off a 28px grip.
- **A Playwright `boundingBox()` can be negative.** Ranking four beds scrolls
  the page, leaving the panel above the fold; `page.mouse` then dispatches at
  coordinates outside the viewport and every event lands on `<html>`. The
  component looked broken and was not. Call `scrollIntoViewIfNeeded()` before
  measuring, and throw on a negative y so it fails loudly.
- **A harness that chains expectations reports one bug twice.** The ranking
  checks originally asserted against what an earlier step was *supposed* to
  produce, so a single drag failure also failed the keyboard path. Each check
  now derives its expectation from the order observed immediately before it
  acts.
- **`shrink-0` in a flex row is a horizontal-scroll bug waiting for a long
  string.** The "How this works" button pushed 40px past the viewport at 390px
  with a real trip name. The `<h1>` had wrapped fine on its own. Any new flex
  header needs the overflow assertion, which is one line:
  `document.documentElement.scrollWidth - clientWidth`.
- **The App Check debug token must never be a `VITE_` variable.** Vite inlines
  `VITE_*` into the production bundle at build time, and a debug token in
  shipped JS is an App Check bypass for anyone who reads it. Unprefixed in
  `.env.local` (gitignored), read in Node and injected by the harness. Proven
  absent from `dist/` after a build — repeat that check if the mechanism
  changes.
- **Do not widen a console-error allowlist to make a run green.** The App
  Check 403 was a genuine failure (headless reCAPTCHA), and the fix was
  registering a debug token. "Failed to load resource: 403" is also exactly
  what a broken callable prints, so a text-match filter on it would have
  swallowed the class of bug that gate exists to catch.

### Known red (pre-existing, not caused by P5)

`verify/local-auth-enforcement.mjs` (2 checks) and
`verify/local-magiclink-flow.mjs` (times out) both fail at the same place:
**`submitPreferences` returns 401 to a caller that is authenticated.**

This predates P5, provably: `local-auth-enforcement` is a raw HTTP call
against a function P5 never modified (`submitPreferences` appears zero times
in `f1acdb8`'s diff) and involves no client code at all.

Cause unconfirmed. The likely story is that P2.3's `enforceAppCheck: true`
landed after these emulator harnesses were written and neither sends an App
Check token — but the functions emulator logs no App Check rejection, and the
handler executes before returning 401, which does not fit cleanly. **First
thing to try: give both harnesses the registered debug token**, the way
`p5-*.mjs` now do. Their payloads were already updated for P5.2's required
`displayName`, so they are otherwise current.

### Shipped (2026-08-03, second session) — do not redo

**P4 complete** (the `updateTrip` dashboard form, plus reopen → re-allocate
exercised end to end and audited envy-free) and **P2.2's code half**
(verification meta tag, `ads.txt`, route-gated loader, `[data-ad-free]`
guards, `verify/ads-placement.mjs`).

Three things worth not relearning:
- **AdSense format control does not exist in page code.** Vignette-only is
  an account setting. Anything that must be guaranteed has to be guaranteed
  by *where the script loads*, not by configuration.
- **The `**` hosting rewrite returns 200 with `index.html` for any missing
  path**, so `ads.txt` and any other static file must be checked by BODY.
  Same trap as the `/__/auth/action` check in P1.1.
- Extracting the envy checker into `verify/envy-audit.cjs` was verified
  behaviour-preserving by regenerating `verify/simulation-results.md` and
  diffing: byte-identical apart from the wall-clock line.
- **A verifier can fail by agreeing with nothing.** `envy-audit.cjs` grouped
  couples by the simulation's `+copy` base-email convention, which the product
  stopped producing when mutual `partnerEmail` confirmation shipped. On
  production data it split every couple, valued the pair from one member's
  bids, and **manufactured** an envy violation the allocator had not created —
  intermittently, because which member survived depended on the unordered
  `assignment.emails[0]`. The first green run was luck. Run a harness twice
  before believing it, and check that its model of the inputs matches what the
  product actually writes today.

### Shipped (2026-08-03, one supervised session) — do not redo

**P0 listing import**, **P1** (magic-link auth enforced + results email +
inbox deliverability), **P2.1** privacy/terms, **P2.3** App Check on 6 of 7
callables, **P3** retention (cron in dry run + trip dates + shared cascade),
**P4 partial** (5 callables, dashboard UI for 4).

Also fixed, found by the e2e on its first real run: **signed-in users could not
submit at all.** `handleSubmit` guarded on the local `email` state, which is
only populated on the unverified path, so every signed-in submission hit
"Please enter your email" while the field showed their address. Invisible to
hand-testing because first-time submitters were unaffected.

Three things that cost time and are worth not relearning:
- **`X-Goog-User-Project` is required on every Identity Toolkit call**, or it
  bills the wrong project and misreports state as `CONFIGURATION_NOT_FOUND`.
- **protobuf JSON omits false booleans**, so `passwordRequired: false` is
  invisible in a response — verify passwordless with a live `sendOobCode`.
- **updateMask on a message field replaces the whole submessage.**
  `notification.sendEmail` as a mask would wipe all four email templates; name
  the leaf fields. Same shape as `authorizedDomains` being a full replacement.

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
  - **One bounded exception, shipped in P5.2 and bounded on purpose:**
    `submissions` stays unreadable by rules, and **`listParticipantNames` is
    the only callable that returns anything derived from it to a non-admin.**
    It returns display names and opaque submission ids — never an address. The
    single exception is the collision-disambiguation mask
    (`j••••y@gmail.com`), shown only when two display names on one trip
    collide. If a change would put a full address in that response, the change
    is wrong.
    - **This is enforced, not just documented.**
      `verify/p5-partner-ui.mjs` seeds submissions with known addresses and
      asserts none of them appear anywhere in the page source. Keep that check
      alive; it is what turns the invariant from a comment into a test.
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

## Roadmap — all shipped, kept for the reasoning

**Every item below is built.** P0–P4 are deployed; P5 is committed and awaiting
the owner's deploy (see "Start here"). These sections stay because they record
*why* each thing is the way it is — the constraints, the rejected options, and
the measurements behind the decisions. Read before changing any of it; do not
re-implement any of it.

### P0 — Listing import (owner-requested 2026-08-03; promoted from "Later")

The owner has a real trip coming up and does not want to hand-type beds.
**Scope change from the parked version: upload a document, not just paste
text.** Organizer uploads (or pastes) the listing; Claude extracts rooms,
beds, and total cost; the create form is pre-filled; **the organizer always
reviews and edits before submit.** Extraction is a suggestion, never a
commitment — nothing is written to Firestore until the organizer submits the
form themselves.

Still deliberately **paste/upload, not scrape.** URL scraping violates Airbnb
ToS, fights bot detection, and gets Cloud Function IPs blocked. That
constraint is unchanged by the promotion.

- Callable `extractListing` (7th callable), `@anthropic-ai/sdk` in `functions/`.
- **Model `claude-haiku-4-5`, decided 2026-08-03 by measurement**, not by
  taste. `verify/preview-listing-import.cjs --sweep` runs the same listing
  through every candidate and prints tokens, cost, and whether it caught the
  sample's deliberate "sleeps 12 but only 10 described" trap. Measured:
  opus-5/high $0.0261, opus-5/low $0.0200, sonnet-5/high $0.0082,
  sonnet-5/low $0.0081, **haiku-4-5 $0.0026**. All five found the same 6 beds
  and all flagged the discrepancy. Re-run the sweep before changing the model.
- Two API constraints found by measurement: **Sonnet 5 returns 400 for the
  `fallbacks` parameter** (Opus-5 only), and **Haiku 4.5 predates adaptive
  thinking and `effort`** and 400s on both. Both are handled by spreading the
  options in conditionally rather than pinning the model.
- Cost is dominated by **output tokens, because thinking bills as output** --
  so `effort` is a bigger lever than model choice within a generation.
- **Structured outputs (`output_config.format` + a JSON schema), not ad-hoc
  tool calling.** Same "have the model fill in fields" idea, but the schema
  is enforced server-side so the response is guaranteed parseable — no
  hand-written JSON repair on a path that feeds a money form.
- Accepts PDF (base64 `document` block), images (`image` block), and plain
  text. One-shot extraction, so base64 rather than the Files API.
- `ANTHROPIC_API_KEY` functions secret. **Owner's account to create** — same
  rule as Brevo/AdSense. A missing key must degrade gracefully: the callable
  returns a plain error and the create form stays fully usable by hand. It
  must never block trip creation.
- Costs money per call and is unauthenticated like `createTrip` — it is a
  spam target. P2.3 App Check covers it; until then cap it hard.

> **Acceptance:** a real listing document produces a create form the owner
> only has to correct, not retype; submitting still goes through the normal
> `createTrip` path; with no API key set, trip creation works exactly as it
> does today.

### P1 — Email: verification + the one non-optional notification

**Decided 2026-07-28: Option A** of `docs/drafts/P1.1-magic-link-auth.md` —
trip codes keep gating access; auth binds identity at the moment of
submission. That draft is now the implementation reference.

**1.1 Magic-link auth — CODE COMPLETE. Auth ENABLED 2026-08-03 (owner, Cloud Shell).**
The earlier note here said Auth "has never been initialized (the Identity
Toolkit admin API returns `CONFIGURATION_NOT_FOUND`)". **That was wrong** — a
config resource existed all along (`subtype: FIREBASE_AUTH`, i.e. legacy
Firebase Auth, *not* Identity Platform, so no billing surface). The earlier
probe had hit a disabled API on the wrong quota project and the confusing
403 was recorded as "not initialized". The *conclusion* was right, though:
the Email/Password provider genuinely was off (`signIn` carried only
`hashConfig`, no `signIn.email` block at all).

Done via Cloud Shell rather than the console (the console pathway was not
findable). Reproducible — every call needs `-H "X-Goog-User-Project:
room-selector"` or it bills the wrong project and lies about the state:

```bash
gcloud services enable identitytoolkit.googleapis.com --project=room-selector
# GET  /v2/projects/room-selector/config                    → read state
# PATCH ?updateMask=signIn.email.enabled,signIn.email.passwordRequired
#       {"signIn":{"email":{"enabled":true,"passwordRequired":false}}}
# PATCH ?updateMask=authorizedDomains   (FULL replacement — include defaults)
#       ["localhost","room-selector.firebaseapp.com","room-selector.web.app",
#        "www.roomselector5000.com","roomselector5000.com"]
```

Do **not** call `identityPlatform:initializeAuth` — the config already
exists, and that method risks upgrading the project to the GCIP SKU.

Two gotchas worth keeping: `passwordRequired: false` (the passwordless
toggle) is **absent from the response when set**, because protobuf JSON
omits false-valued booleans — verify empirically with a
`v1/accounts:sendOobCode` call (`requestType: EMAIL_SIGNIN`), not by reading
the config back. And the domains PATCH is not cosmetic:
[src/auth.js:91](src/auth.js#L91) passes `url: ${window.location.origin}/` as
the continue URL, so `sendSignInLinkToEmail` throws
`auth/unauthorized-continue-uri` on the live site without it.

Then: `npm run build && firebase deploy --only firestore,functions,hosting`,
and run the production e2e (which needs the auth strategy below).
**Deploy is gated on 1.4 below, not on Auth.**

Firebase Auth email-link sign-in. **Sender decided
2026-07-28: launch with the default** `noreply@room-selector.firebaseapp.com`
(Google-reputation deliverability, zero DNS).

**Correction 2026-08-03:** this section claimed the *links inside* the email
use `www.roomselector5000.com`. They do not. The link host comes from
`authDomain` in [src/firebase.js:10](src/firebase.js#L10), still
`room-selector.firebaseapp.com`, and the live Auth config confirms it
(`callbackUri: https://room-selector.firebaseapp.com/__/auth/action`).
`actionCodeSettings.url` is the *continue* URL, not the handler host — a
different field. It works, but recipients see a `firebaseapp.com` link on an
email asking them to verify identity.

**Second correction 2026-08-03: `authDomain` is the wrong lever.** The link
host in a Firebase-sent email comes from `notification.sendEmail.callbackUri`
in the Auth config — a server-side field, currently
`https://room-selector.firebaseapp.com/__/auth/action`. The client's
`authDomain` governs OAuth popup/redirect flows, which this product does not
use; email-link sign-in calls `signInWithEmailLink` against the current URL
directly. Both values happen to be the same string here, which is why the
mistake was not obvious. To brand the link, PATCH `callbackUri` — editing
`src/firebase.js` would have changed nothing.

Verified the switch is viable: **both hostnames really serve the handler** —
`curl https://www.roomselector5000.com/__/auth/action` returns the actual
`fireauth.oob.OobHandler` page, not the SPA fallback. Check the *body*, not
the status code: the `"source": "**"` rewrite returns 200 with `index.html`
for every path, so a 200 alone proves nothing. Firebase reserves `/__/*`
above the rewrite. Flip `authDomain` as its **own** commit after the main
deploy is verified, so a broken sign-in has one suspect.
`submitPreferences` requires
`request.auth` and takes the email from the verified token. Enforce for new
submissions only; do not invalidate existing trips.

**1.3 Custom sender domain — DNS session DONE (owner, 2026-07-28).**
`roomselector5000.com` is authenticated in the owner's Brevo account
(Fox Dog Software Development, LLC): `brevo-code` TXT, DKIM CNAMEs
(`brevo1`/`brevo2._domainkey`), branded link subdomain
`mail.roomselector5000.com`, and a single merged DMARC record
(`p=quarantine`, rua to both Brevo and GoDaddy) — all verified live on the
authoritative NS; site A/CNAME records untouched. **Results emails send
from `noreply@roomselector5000.com`.** Still parked, owner-triggered:
flipping *auth* emails to Brevo via Firebase Auth's custom-SMTP setting —
until then auth emails stay on the Firebase default sender (see 1.1).

**1.4 Deliverability — the verification email landed in SPAM (owner's Gmail,
2026-08-03). Unblocked-but-known-risk; do not treat as cosmetic.**
Measured with a real `v1/accounts:sendOobCode` call after enabling Auth,
sender `noreply@room-selector.firebaseapp.com` (the 1.3 default). A
verification email in spam is not a degraded experience — it is a **missing
ballot**. The person never submits, the organizer never learns why, and the
allocation runs over a smaller electorate. It fails silently on the
recipient's side, which is the same shape as every other production bug in
this repo.

Scope it honestly: **n=1, one Gmail account.** Not proof of a systemic
problem. But `firebaseapp.com` is a generic Google subdomain heavily used by
phishers and it does not match the site the person is standing on — a
plausible mechanism, not just bad luck.

**This is a deliverability problem, not an architecture problem.** Any
verify-by-email design has it, including Option C of the P1.1 draft. Do not
redesign auth in response to it. The fix is the parked half of 1.3: flip
*auth* emails to the Brevo sender (`roomselector5000.com` is already
DKIM/DMARC-authenticated). Caveat: a freshly-authenticated domain has no
sending reputation, which is itself a mild spam signal — likely better, not
certainly better. Re-measure with the same `sendOobCode` curl after flipping.

**RESOLVED 2026-08-03.** Auth email now goes through Brevo from
`noreply@roomselector5000.com` and lands in the Gmail **inbox**. Kept below
because the sequence is the reusable part, and because the cause was never
architecture.

The config path (`notification.sendEmail.method` → `CUSTOM_SMTP`) has two
traps. `senderEmail` lives **inside** the `smtp` object, not beside it — a
sibling `senderEmail` is rejected with "Cannot find field". And the updateMask
must be `notification.sendEmail.method,notification.sendEmail.smtp`, **not**
`notification.sendEmail`: the broad mask replaces the whole submessage and
would wipe the four `*Template` blocks and `callbackUri`. Same full-replacement
trap as `authorizedDomains`.

Do **not** enable Brevo's "block unauthorized IPs for SMTP keys". Firebase Auth
sends from Google infrastructure with no fixed, published IP range; enabling it
stops auth email entirely.

**Rotating the Brevo SMTP key BREAKS auth email until the PATCH above is
re-run.** Firebase stores that password in its own config; rotating it in Brevo
leaves Firebase authenticating with a dead credential, and the failure is
silent — `sendOobCode` still returns 200 and queues a send that never arrives.
Rotated once already (owner, 2026-08-03) and the full loop was verified: new
key → re-run PATCH → test `sendOobCode` → **email arrived in the inbox**. The
order is always: rotate in Brevo → re-run the PATCH → send a test and confirm
it lands. Skipping the last step proves nothing; the failure is silent.

**The Brevo SMTP key is a different credential from `BREVO_API_KEY`.** The
transactional API key (used by `functions/email.js` for results emails) will
not authenticate an SMTP session, and vice versa. Rotating one does not affect
the other.

Original call, kept for the record:
**fix deliverability FIRST, then deploy.**
The owner's own trip is the first real use of this, so no participant should
meet a spam-foldered verification link. Sequence:

1. Point Firebase Auth at Brevo SMTP (`notification.sendEmail.method` →
   `CUSTOM_SMTP`, sender `noreply@roomselector5000.com`). **The Brevo SMTP
   key is not the same credential as `BREVO_API_KEY`** — the transactional
   API key will not authenticate an SMTP session; generate an SMTP key in
   Brevo's SMTP & API panel.
2. Re-run the `accounts:sendOobCode` curl and confirm it reaches the inbox.
3. `npm run build && firebase deploy --only firestore,functions,hosting`.
4. Verify in a browser: 390px and desktop, dark, zero console errors.

Recorded so this does not get rediscovered as a mystery ("nobody submitted").

**1.2 Results email at finalization.** Without it the organizer hand-delivers
results to 18 people. Send from `allocateRooms` after the batch commits, via
Brevo's transactional HTTP API (`POST /v3/smtp/email`; 300/day free), sender
`noreply@roomselector5000.com` (see 1.3). API key is set in the
`BREVO_API_KEY` functions secret (done 2026-07-28); if the key is absent, log
and skip — **email failure must never fail an allocation**. No Brevo
templates or contact lists: email content lives in function code (voice
rules are repo conventions), and participant emails are never synced to
Brevo contacts (transactional-only — the P2.1/P3 privacy promises depend on
this). Do **not** use the "Trigger Email" Firebase extension: Firebase
Extensions is deprecated and shuts down March 2027.

Content rules: the results email states each recipient's bed and exact dollar
figure literally (voice rules apply in full). Include the results link and
trip code.

Harness note — **DECIDED 2026-08-03: admin-generated sign-in link.**
`verify/e2e-napa-flow.mjs` calls Admin SDK
`generateSignInWithEmailLink(email, {url, handleCodeInApp: true})`, which
builds the genuine magic link and returns it **without sending mail**, then
navigates to it. The run therefore walks the real production journey — link
→ `/__/auth/action` → sign-in → submission — with no bypass in the callable
and no mail to `demo-*@example.com`.

Rejected: a custom-token shortcut (verifies submission works *given* a
session, not that a person can obtain one — and the magic-link half is where
both known bugs were), and the draft's env-gated bypass (a conditional hole
in the check that makes ballots trustworthy, living in production).

Two things this surfaced, both silent failures if missed:
- **Each participant needs its own browser context.** Firebase Auth persists
  per origin, so a shared context signs everyone in as whoever went first and
  the trip gets allocated over one ballot repeated, with nothing visibly wrong.
- `completeSignIn()` **prompts** for the address when there is no stashed
  submission (the open-on-another-device path). The dialog handler must answer
  it with the address; auto-accepting blank fails sign-in confusingly.

Signing in *before* filling the form also makes the form short-circuit at
`SubmissionForm`'s `if (user?.email)` branch, so the harness generates no
verification email at all. `firebase-admin` is now a root devDependency.

The emulator harnesses stay the fast loop — see README "Local stack".

Two traps found the hard way, both of which returned no error:
- A single-use sign-in code plus React StrictMode's double-invoked effect
  meant sign-in succeeded and *then* rendered "your link expired". Guard
  with a ref, not a cancellation flag — the flag suppresses the state
  update, not the second network call, and leaves the spinner up forever.
- `computeAllocation` emits `beds` as a **string**, stored as `roomNames`.
  Anything treating it as an array yields an empty bed name.

> **Acceptance:** a submission without a verified session is rejected by the
> callable (not just the UI); finalizing a trip emails every participant
> their own assignment; allocation still succeeds with no email key present.

### P2 — Legal + revenue

**2.1 Privacy policy + terms.** Static routes, plain language. Legally
required (emails are collected from the public) and AdSense will not approve
without it. Must state: what is collected (emails, bids, preferences), the
**6-month retention rule from P3**, that ads are served, and a contact route.

**2.2 AdSense — Auto ads, vignettes only. CODE SHIPPED 2026-08-03; ad
serving blocked on the owner.** Owner decision: monetize navigation
boundaries (after creating a trip, after joining), keep the pages themselves
bespoke.

**Measured 2026-08-03: the format toggles cannot be set from this repo.**
Auto ads formats (vignette on; banner/multiplex/related-search, anchor, side
rail and *ad intents* off) are AdSense-UI settings with no page-level
equivalent — `enable_page_level_ads` is legacy. AdSense's "excluded areas"
is UI-side too, and Google documents that it "only applies to in-page Auto
ads… won't prevent overlay ads such as anchor ads." **So account settings
can never be the guarantee.**

The guarantee is `src/ads.js`: the loader is allowlisted to `/`, `/create`,
`/join`, `/privacy`, `/terms`, and denied by default everywhere else. A route
that never loads `adsbygoogle.js` cannot show an ad in any format. `/create`
and `/join` are on the list because a vignette shows as a reader *leaves* a
page — the destinations stay clean.

Verification is the **meta tag** (`google-adsense-account`), deliberately not
the loader snippet: a `<script>` in `<head>` would put ad code on every route
of this SPA including `/results/:tripId`, making the P2.1 privacy promise
("no ads on the pages where you rank beds, adjust prices, or read your
result") false in writing.

Honest limit: once `adsbygoogle.js` has executed, removing its tag does not
unload it. The hard guarantee is the loader never entering the document on a
**direct load** of a money route — the common case, since trip links arrive
by text and results links by email. `verify/ads-placement.mjs` asserts the
in-session navigation case as an outcome rather than trusting the mechanism.

**Remaining, owner-only: finish site verification (still "needs review") and
set the Auto ads format toggles.** Both written out step by step in
`docs/drafts/P2.2-adsense-settings.md`. Ad intents is the one that is easy to
miss — it turns page *text* into ad links, which on a page explaining what
someone pays would rewrite the explanation itself.

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

> **Acceptance — MET 2026-08-03.** Every operation exercised through the
> dashboard on `[demo]` trips in production. `verify/p4-lifecycle.mjs`,
> 25/25, zero console errors, 390px for the edit form and desktop for
> allocation: the edit form persists name/cost/beds and leaves no orphaned
> rooms, and refuses with an explanation once anyone has submitted; reopen
> cleared 3 assignments and kept all 4 ballots; re-allocation produced 3
> fresh assignment docs with **envyPairs=0, maxEnvy=0**, budget error 0,
> welfare/person 51.25. `requireAdmin` rejects participant codes in one
> place for all five callables.
>
> The first 24/24 run of this harness was **not** valid evidence — the
> auditor was nondeterministic on production data (see the couples bug in
> Shipped below). The figures above are from a run reproduced after that
> fix.

## Later (parked — constraints still bind)

- ~~**Listing import.**~~ **Promoted 2026-08-03 — now P0.** The
  ad-vignette-before-the-AI-call idea stays parked with P2.2 (needs the
  owner's AdSense account).
- ~~**Drag-rank**~~ **BUILT 2026-08-03** as P5.4 (`56132b2`). It needed no key
  and no callable, so it went with the rest of the first-timer's pass. See
  `src/components/RankedList.jsx` and `verify/p5-ranking.mjs`.

- **AI ranking assist — specced 2026-08-03, then deliberately re-parked the
  same day (owner).** Not blocked, not abandoned: descoped so P5 stays UI-only
  and ships without waiting on an API key. The work already done is below so
  nobody re-derives it.

  **The constraint, which does not expire while parked:**

  > The assist helps someone *express what they actually want*. It must never
  > help them *win*: the mechanism is not strategyproof, and coaching
  > bid-shading would break the exact property the product sells. If a user
  > asks how to game it, the honest answer is that bidding true values is what
  > makes the result defensible.

  Mechanically that means the callable must never reason about other
  participants at all — it never sees another person's bids and is never told
  how many people have submitted. `ARCHITECTURE.md:93-96` is why: the mechanism
  is manipulable in principle, and what actually holds it together is that
  these are friends who cannot see each other's bids. An assistant that coached
  shading would break precisely that, at scale.

  **The finding that decides whether it is worth building** (measured
  2026-08-03, not assumed): the only ranking surface a trip stores is
  `rooms[].name` / `description` (≤300 chars) / `basePrice` / `capacity` /
  `type`. No floor plan, no adjacency, no room-to-room relationship.
  - Answerable when `description` is populated, and the extractor is prompted
    for exactly this: ensuite vs shared bath, ground floor vs under-the-stairs,
    a door that closes vs an open loft, view vs none.
  - **Not** answerable: "near a bathroom." `Shares hall bath` says a bath is
    shared, not where it is. Do not add a floor-plan model to make it possible.
  - **`createTrip` requires only `name`**, so a hand-typed trip can have every
    `description` empty — and the assist would rank on bed type alone while
    sounding just as confident. Any build must gate on description coverage and
    say when it is ordering by type alone.

  **Design decisions already made:** `suggestRanking` callable; structured
  outputs, not ad-hoc tool calling (the draft feeds a money form); the zero-sum
  rule enforced in code after the model returns, never merely asked for in the
  prompt; stateless, with the person's free-text description never persisted;
  App Check on, capped per submission; model chosen by a fresh sweep starting
  at `claude-opus-5` rather than inheriting P0's haiku result, since extraction
  and judging-what-someone-meant are different tasks.

  **Key decision, still valid: a separate `ANTHROPIC_API_KEY_ASSIST`, and only
  for one of the three usual reasons.** Checked against the live API docs:
  rate limits are **per organization**, not per key, so a second key buys zero
  isolation (only a separate *workspace* can fence that off, and it is a
  ceiling, not a reservation); dollar-level cost attribution is by
  `workspace_id`, not by key, though the Usage API *does* group by
  `api_key_ids[]` for per-feature token attribution. What justifies the split
  is **revocation**: the assist is participant-facing — roughly one caller per
  bed, versus one organizer — so killing an abused assist must not take trip
  creation down with it.
- **Equal-budget bidding** (the real answer to wealth leaking into
  allocations, and to manipulation among strangers) and a pro tier.
- **Small polish, grab when touching the client:** replace the default Vite
  favicon (`index.html` still points at `/vite.svg`) with a Selecta-bot head
  SVG. (Custom sender domain: DNS done 2026-07-28 — see P1.3; only the
  owner-triggered auth-email SMTP flip remains parked.)

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

**P0–P5 are built as of 2026-08-03.** The roadmap is empty. What remains is
one repo task and a set of owner decisions.

**THE ONE THING TO DO FIRST: P5 is committed but NOT DEPLOYED.** Five commits
(`f1acdb8` → `29233f2`) sit on `main`, unpushed and unshipped. Production is
still running the pre-P5 client and functions. Deploying is
`npm run build && firebase deploy --only firestore,functions,hosting` — all
three together, never two.

Deploy is the owner's call rather than an unattended one, deliberately: P5.2
changes the submission form's data contract, the owner's own trip is the first
real use of it, and two local harnesses are red for reasons nobody has
confirmed yet (see "Known red"). Sequence when the owner says go:

1. Deploy all three.
2. `verify/e2e-napa-flow.mjs --discriminating` against a fresh `[demo]` trip.
   It now exercises **both** pairing paths — a typed name claim and a dropdown
   pick — so a broken partner flow fails there rather than in the owner's real
   trip.
3. Check the couples panel on the admin dashboard shows the pair as confirmed.
4. Browser check at 390px and desktop, dark, zero console errors.

**Migration note, and it matters:** submissions written before this deploy
have no `displayName`, `partnerSubmissionId`, or `partnerClaimName`.
`listParticipantNames` falls back to a masked local part so they stay
selectable, and `removeSubmission` keeps its old explicit `partnerEmail` clear
for exactly them. Production `submissions` was empty of orphans as of this
session, so the blast radius is any trip collected between then and the
deploy.

Everything else outstanding is owner-blocked, not repo-blocked:

1. **P2.2 is blocked on the owner, not on the repo.** Finish AdSense site
   verification (still "Your site needs review" — both the meta tag and
   `ads.txt` are already live, so this is clicking Verify) and set the Auto
   ads format toggles. Step by step in
   `docs/drafts/P2.2-adsense-settings.md`. **Re-run
   `verify/ads-placement.mjs` after approval** — until ads actually serve,
   today's clean run is a baseline, not a proof.

2. **Open obligations carried over, still not closed:**
   - `privacy@roomselector5000.com` — the policy currently points at
     `foxdogdevelopment@gmail.com`; whichever address is real, it must route
     to a real inbox.
   - **P3 retention is still a DRY RUN.** The privacy policy promises
     6-month deletion in writing; nothing is deleted until the owner reviews
     a cron log and sets `RETENTION_ENABLED=true`.

3. **RESOLVED 2026-08-03 (owner).** The 18 legacy submissions from the
   January 2026 trip — real email addresses, no `tripId` field, their trip
   document long gone — were deleted by the owner. `submissions` is now
   empty of orphans.

   The structural gap they exposed is worth remembering: **retention cannot
   see a submission that has no `tripId`.** `findExpiredTrips` iterates
   `trips` and `collectTripRefs` queries `where("tripId","==",id)`, so an
   equality filter never matches a document missing the field. Any future
   path that removes a trip document without going through
   `functions/trip-cascade.js` will orphan its submissions the same way, and
   the published 6-month promise will silently not apply to them. The cascade
   module is the only safe deletion route.

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
node verify/p5-couples.cjs         # pairing logic; no browser, no emulator
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>
```

The P5 browser harnesses run against the **emulator**, not production, and
need the App Check debug token in a gitignored `.env.local` — full setup in
README "Local stack".

```bash
firebase emulators:start --only auth,firestore,functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed-demo-trips.js
VITE_USE_EMULATOR=true VITE_AUTH_EMULATOR=true npm run dev -- --port 5173

FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/p5-ranking.mjs      # and p5-guidance.mjs, p5-partner-ui.mjs
```

---

## Out of scope

**No Terraform.** `firebase.json`, `firestore.rules`, and
`firestore.indexes.json` *are* the IaC. **No user-account system** beyond
magic-link identity binding — codes remain the access model.
