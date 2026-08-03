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
| `firestore.rules` (deny-by-default), **seven** callables, hosting from `dist/` | **Deployed**, verified end to end in production |
| `allocateRooms` | **Envy-free allocator**, proven in production on a discriminating input (2026-07-28) |
| Couples | Mutual `partnerEmail` confirmation. The `+copy` hack no longer forms couples. |
| Design system | Selecta-bot (cream/teal/coral, bot states), all six views verified at 390px, dark mode, zero console errors |
| Test harnesses | `verify/e2e-napa-flow.mjs` (production e2e; `--discriminating` proves which allocator is live), `verify/ads-placement.mjs` (P2.2 negative), `verify/p4-lifecycle.mjs` (edit form + reopen→re-allocate), `verify/regression-envyfree.cjs` (18/18 vs reference), `verify/simulate-envyfree.cjs` (576 trips, zero envy — results in `verify/simulation-results.md`), `verify/envy-audit.cjs` (the shared independent envy check), `verify/preview-results-email.cjs` (email rendering; `--send` posts one real message), `verify/local-auth-enforcement.mjs` + `verify/local-magiclink-flow.mjs` (emulator-only; see README "Local stack") |
| Firebase Auth | **Enabled 2026-08-03** (owner, via Cloud Shell — see P1.1). Email/Password + passwordless on; both `roomselector5000.com` hostnames in `authorizedDomains`. Legacy Firebase Auth, not Identity Platform. |
| Email | **DEPLOYED 2026-08-03.** Magic-link verification enforced (`submitPreferences` returns 401 to an unauthenticated `curl`, verified in production), results email sends at finalization. Auth email goes via Brevo from `noreply@roomselector5000.com` and **lands in the inbox** — P1.4 resolved. |
| Listing import | **DEPLOYED 2026-08-03.** `extractListing` (7th callable) on `claude-haiku-4-5`, ~$0.0026/call. Verified end to end in production: pasted listing → populated create form, 3.3s mobile / 4.8s desktop, zero console errors. |
| Trip lifecycle (P4) | **COMPLETE 2026-08-03.** Five admin-gated callables, all reachable from the dashboard including the `updateTrip` edit form. Both former gaps closed and verified in production by `verify/p4-lifecycle.mjs` (25/25): the edit form persists and refuses once anyone has submitted; reopen → re-allocate yields a fresh **envy-free** result (envyPairs=0, maxEnvy=0, budget error 0). |
| Trip dates | **Collected 2026-08-03** (optional `startDate`/`endDate`, YYYY-MM-DD strings on the trip doc). |
| Retention (P3) | **Cron deployed, DRY RUN.** `purgeExpiredTrips`, monthly 09:00 UTC on the 1st. Deletes nothing until `RETENTION_ENABLED=true`. Cascade extracted to `functions/trip-cascade.js` and shared with `seed --clean`. |
| Privacy policy + terms | **DEPLOYED 2026-08-03** (P2.1). `/#/privacy` and `/#/terms`, linked from a footer on every route. **Two open obligations: `privacy@roomselector5000.com` must route to a real inbox, and the policy promises 6-month deletion that P3 has not implemented yet.** |
| App Check | **ENFORCED 2026-08-03** (P2.3) on six of seven callables via classic reCAPTCHA v3. `getResults` deliberately open — it is opened from the results email, often days later in a mail client's in-app browser where reCAPTCHA scores poorly, and blocking someone from seeing what they owe is worse than a scraper reading an already-shared page. Raw `curl` → 401 on the six, 400 on `getResults`. **The e2e harness needs `APPCHECK_DEBUG_TOKEN` (registered debug token, never committed) or every submission is rejected.** |
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
  `data-testid` over copy for anything P5 adds.

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
  - P5.2 adds one bounded exception, and it is bounded on purpose:
    `submissions` stays unreadable by rules, and **`listParticipantNames` is
    the only callable that returns anything derived from it to a non-admin.**
    It returns display names and opaque submission ids — never an address. The
    single exception is the collision-disambiguation mask
    (`j••••y@gmail.com`), shown only when two display names on one trip
    collide. If a change would put a full address in that response, the change
    is wrong.
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

### P5 — The first-timer's pass (owner-requested 2026-08-03, third session)

Everything through P4 makes the mechanism *correct*. P5 is about whether a
person who has never seen this product can drive it. Five places in the
create → join → submit journey leave someone guessing or make them work too
hard to say a simple thing, and that is expensive here in a specific way: a
person who misunderstands the form submits a ballot that does not say what
they meant, and **the allocator then fairly allocates fiction**. Envy-freeness
over a misunderstood ballot is worth nothing, and — like every other bug in
this repo — it fails silently.

None of these is a crash. Every one of them returns HTTP 200.

5.1–5.3 were the owner's original three; **5.4 and 5.5 were promoted out of
"Later" in the same session**, because drag-rank and the ranking assist are
the same problem seen from the other end — not "why is this confusing" but
"why is this so much work to say."

**5.4 is the only P5 item with no external dependency** and can ship alone.
5.5 is blocked on an owner-created API key, like P0 before it.

**5.1 Listing import: say what to paste.**

The panel copy today is "Upload the listing or paste its text"
([src/components/TripCreator.jsx:291](src/components/TripCreator.jsx#L291)).
It never says *which* text, never states the size or format limits until
after a failure, and never says that a URL does nothing.

- Explicit, numbered instruction: open the listing, select the whole page
  **including the sleeping-arrangement / bedroom section and the price
  breakdown**, paste it. The bedroom section is the part the extraction
  actually needs and the part a person is least likely to include.
- State accepted formats and the 3 MB cap **up front**, not only in the error
  path. `MAX_UPLOAD_BYTES` and `ACCEPTED_UPLOADS` already exist at
  [TripCreator.jsx:8-9](src/components/TripCreator.jsx#L8-L9) — render from
  them, do not restate the numbers in copy that can drift.
- **Refuse a bare URL client-side**, plainly: Selecta-bot cannot open links —
  paste the page's text or upload a screenshot. This is the likeliest first
  attempt (the product is deliberately paste-not-scrape, see P0) and today it
  spends an API call to return nothing useful. Catching it in the browser is
  free and the message is the only place a user learns the constraint.
- Voice: this is instruction copy about a thing that costs money, so it is
  literal. Retro flourish stays in the panel heading.

> **Acceptance:** a first-time organizer who pastes an Airbnb URL is told why
> that cannot work and what to do instead, without an API call; the formats
> and size cap are readable before choosing a file; a pasted listing that
> includes the bedroom section fills the bed list.

**5.2 Partner selection by name, never by email.**

Today [SubmissionForm.jsx:370](src/components/SubmissionForm.jsx#L370) takes
`partnerEmail` as free text, and a couple forms only on *exact mutual* match
([functions/allocation.js:123-129](functions/allocation.js#L123-L129)). Two
ways that fails, both silent, both ending as two singles with nobody informed:
a typo, or — the one the owner hit — being named as `jordan@gmail.com` by
someone who then verifies under `jduffey@gmail.com`. Edit-distance repair
cannot bridge that second case; the addresses are not near each other.

**Decided 2026-08-03: a human never types an email address in the pairing
flow at all.** Your own address comes from the verified magic-link token and
is correct by construction. Your partner's comes from a server-side
dereference of an opaque id — never from your memory of how they spell it.
This deletes the entire failure class rather than repairing instances of it.

- `submissions` gains **`displayName`** (required, ≤40 chars, e.g. "Jordan
  D."), collected beside the email field.
- New callable **`listParticipantNames(tripId)`** → `[{submissionId,
  displayName}]` and **no email addresses, ever**. App Check enforced like
  the other six; it is reachable from the trip page, which is not `getResults`
  and has no mail-client excuse.
- The partner control becomes a **name dropdown**, plus an escape hatch for
  "they haven't submitted yet".
- **`submitPreferences` resolves `partnerSubmissionId` → `partnerEmail`
  server-side and stores `partnerEmail` exactly as it does today.** This is
  the load-bearing decision. `computeAllocation`
  ([allocation.js:114-129](functions/allocation.js#L114-L129)),
  `removeSubmission`'s `where("partnerEmail","==",target)`
  ([functions/index.js:634](functions/index.js#L634)), and
  [verify/envy-audit.cjs:53-55](verify/envy-audit.cjs#L53-L55) all key on that
  field. Changing the wire format while leaving the stored field untouched
  means **zero changes to the allocator or the auditor** — and the auditor is
  precisely the code that once manufactured a phantom envy violation by
  modelling couples differently from the product.
- **The ordering problem is the whole difficulty, so state it:** the dropdown
  can only list people who have *already* submitted.
  - Partner already submitted → pick them. Exact, instant, unspoofable.
  - Partner has not → type their **name** as a pending claim. A name, not an
    address: a wrong name is recoverable by a human reading it, a wrong
    address is not.
  - Mutual confirmation survives, because the *later* side is always the
    exact one. One fuzzy claim plus one dropdown pick is a confirmed pair;
    a fuzzy claim alone is not, exactly as today.
  - Anything still unresolved surfaces in the admin dashboard as a **Couples
    panel** (confirmed pairs / unresolved claims), and `allocateRooms` warns
    before finalizing. The organizer already reads every address via
    `getAdminData`, so they are the only party who can reconcile a mismatch —
    and today they are never told there is one.
- **Name collisions — decided 2026-08-03:** when two display names on a trip
  collide, and only then, disambiguate with a masked address
  (`j••••y@gmail.com`). A deliberate, bounded leak to a person's own
  trip-mates, preferable to a pairing they cannot tell apart. It is a
  decision, not a detail: it is the one place an address fragment reaches a
  non-admin client.
- **Legacy submissions have no `displayName`** — fall back to a masked
  local-part. Cheap now (`submissions` holds only `[demo]` fixtures after the
  owner's cleanup) and it must be written down, because discovering it later
  looks like a broken dashboard.

> **Acceptance:** two people who have never exchanged email addresses form a
> confirmed couple; a participant named before they submit can still resolve
> the pairing from their side; an unresolved claim is visible to the organizer
> *before* allocation rather than discoverable only in the results; no
> response to a non-admin client contains a full email address.

**5.3 Explain the mechanism where it is used.**

The balance bar ([SubmissionForm.jsx:325](src/components/SubmissionForm.jsx#L325))
says "Needs adjustment: +$50" and never says why adjustments must sum to zero.
"+ Show Price Adjustment" is a collapsed disclosure with no explanation behind
it. Envy-freeness is the product, and the page that depends on people
understanding it explains it nowhere.

- New `src/components/Tooltip.jsx` — nothing like it exists today. **Focus-
  and tap-driven, not hover-only**; 390px is a first-class target and a
  hover tooltip is invisible on the device most people will use.
- New **`src/components/SelectaBotScene.jsx`**, kept *separate* from
  [SelectaBot.jsx](src/components/SelectaBot.jsx). Reason: the existing
  component is a verified head-and-shoulders bust with a four-value `state`
  prop; giving it arms means a new `viewBox` and re-verifying every screen
  that renders it. Three scenes — balance scale (zero-sum), ranked list
  (preferences), paired beds (partners).
- A dismissible **"How this works"** dialog on first visit to the submission
  form, remembered in `localStorage` (same mechanism as
  [src/auth.js:37](src/auth.js#L37)), and **reopenable from a persistent
  button** — an explanation that can be dismissed forever is an explanation
  the second-guessing user cannot get back.
- Inline tooltips on the three controls that carry the mechanism: the balance
  bar, the ranking buttons, the ±$25 stepper.
- Voice: the dialog explains *why adjustments sum to zero* and *why ranking
  honestly is the right move*, restated from `ARCHITECTURE.md` rather than
  re-derived. **It must not coach anyone toward a winning bid** — the
  mechanism is not strategyproof (`ARCHITECTURE.md:93-96`), and the constraint
  spelled out in P5.5 binds this copy too. Helping someone express what they
  want is the goal; helping them win breaks the property being sold.
- The dialog and tooltips live inside `data-ad-free="submission"`
  ([SubmissionForm.jsx:313](src/components/SubmissionForm.jsx#L313)). P2.2
  forbids ad markup in money or fairness UI and new UI does not get an
  exemption.

> **Acceptance:** a first-time participant can state, unprompted, why the
> adjustments must sum to zero; the explanation is reachable again after
> dismissal; tooltips open by tap at 390px; zero console errors, dark mode.

**5.4 Drag to rank.**

Ranking today is a "Ranked #3" button plus up/down chevrons
([SubmissionForm.jsx:426-443](src/components/SubmissionForm.jsx#L426-L443)) —
one tap per position, per bed. With six beds that is a lot of tapping to say
something simple, and the current position is only legible by reading a number
off a button. Promoted here from "Later" because it is the same problem as the
rest of P5: the ballot should be easy to make say what the person means.

- Drag to reorder the ranked list, with the chevrons **kept** as a fallback.
  Not decoration: drag is unreliable with assistive tech and fiddly at 390px
  with a thumb, and the harness drives the buttons.
- No API, no key, no server change. This is the one P5 item with no external
  dependency — it can ship on its own.
- **Keep the exact button strings** `Add to Preferences` and `Ranked #N`, or
  update `verify/e2e-napa-flow.mjs` in the same commit. See the harness note
  under "Production failure modes".

> **Acceptance:** a six-bed ballot can be fully ordered by dragging; the
> chevrons still work and still carry the same labels; keyboard reordering
> works; zero console errors at 390px and desktop, dark mode.

**5.5 AI ranking assist (owner-requested 2026-08-03; promoted from "Later").**

Someone who knows they want "a real bed near a bathroom, and I'd rather save
money than have a view" still has to translate that into an ordering plus a
set of adjustments summing to zero. The assist does that translation and hands
back a **draft the person edits**, in exactly the same shape as P0's listing
import: a suggestion, never a commitment, and nothing is submitted until they
submit it.

**The constraint is the whole feature, so it is stated first and it is not
negotiable.** From the parked note, carried over verbatim in force:

> The assist helps someone *express what they actually want*. It must never
> help them *win*: the mechanism is not strategyproof, and coaching bid-shading
> would break the exact property the product sells. If a user asks how to game
> it, the honest answer is that bidding true values is what makes the result
> defensible.

Concretely, that means the callable is forbidden from reasoning about **other
participants** at all. It never sees another person's bids, it is never told
how many people have submitted, and its prompt gives it no notion of winning.
`ARCHITECTURE.md:93-96` explains why: the mechanism is manipulable in
principle, and what actually holds it together is that these are friends who
don't see each other's bids. An assistant that coached shading would be the
thing that breaks that, and it would break it at scale.

- New callable **`suggestRanking`**: free-text preferences + this trip's bed
  list in, `{preferences: [roomId], roomPrices: [{id, price}], notes}` out.
  (P5 adds two callables in total, this one and P5.2's
  `listParticipantNames` — whichever ships first is the 8th.)
- **Structured outputs (`output_config.format` + JSON schema), not ad-hoc tool
  calling** — same reasoning as P0: the response feeds a money form, so it must
  be parseable by construction rather than by hand-written repair.
- **The zero-sum rule is enforced in code after the model returns, not asked
  for in the prompt.** A model that returns adjustments summing to $25 must not
  be able to produce a ballot the client then rejects — normalize or reject
  server-side. `submitPreferences` re-validates regardless
  ([functions/index.js:293-298](functions/index.js#L293-L298)); this is about
  not handing someone a broken draft.
- **Model: decide by measurement, not by inheriting P0's answer.** This is a
  different task from extraction — short input, a judgment about what someone
  meant. Start at `claude-opus-5` and sweep down; extend
  `verify/preview-listing-import.cjs --sweep` (or copy its shape) so the choice
  is a measured one with the numbers in the commit message, exactly as the
  haiku decision was. Do not assume `claude-haiku-4-5` transfers.
- App Check enforced (participant-facing and costs money per call — a bigger
  spam target than `extractListing`, which at least sits behind trip creation).
  Cap it hard, and cap it *per submission*, not just globally.
- **The draft lands in the form, never in Firestore.** Same acceptance shape as
  P0: with no key set, the form stays fully usable by hand and the assist
  degrades to a logged skip. It must never block a submission.

**API key — decided 2026-08-03: a second, separate `ANTHROPIC_API_KEY_ASSIST`
secret, not a reuse of P0's key.** Checked against the live API docs rather
than assumed, because two of the three intuitive reasons to split are wrong:

- **Rate limits do NOT separate per key.** They are set **per organization**
  (`platform.claude.com/docs/en/api/rate-limits`), with optional *lower* caps
  per **workspace**. A second key buys zero additional capacity and zero
  isolation — a runaway assist would still consume the same RPM/ITPM pool that
  `extractListing` draws on. Only a separate workspace can fence that off, and
  a workspace cap is a **ceiling, not a reservation**.
- **Cost attribution in dollars is by workspace, not by key.** The Cost API
  groups by `workspace_id` and `description` only. The **Usage** API does
  filter and group by `api_key_ids[]` — so a separate key gives per-feature
  *token* attribution, which the docs explicitly call the recommended cost
  proxy when many keys are in play. Good enough here; both features run on
  known per-call costs.
- **The real reason to split is revocation.** The assist is participant-facing
  — roughly one caller per bed per trip, versus one organizer — so it is the
  more exposed surface. A separate key means abuse of the assist is killed by
  revoking one secret, and trip creation keeps working. That alone justifies
  it; the other two arguments do not.

Consequence to accept deliberately: **two secrets to rotate, and the
graceful-degradation path must be implemented twice, independently.** That is
a feature — one dead key must not take both features down.

If the owner later wants true dollar-level separation or a hard spend ceiling
on the assist, the lever is a **separate workspace** (whose keys then serve
this callable), not more keys. Owner's call, owner's account — same rule as
Brevo and AdSense.

> **Acceptance:** a plain-English description of what someone wants produces a
> ranking and a balanced set of adjustments they only have to adjust, not
> build; the adjustments sum to zero before the draft is ever shown; asking the
> assist how to win the allocation gets the honest answer from the constraint
> above, not a strategy; with no assist key set, the submission form works
> exactly as it does today.

---

## Later (parked — constraints still bind)

- ~~**Listing import.**~~ **Promoted 2026-08-03 — now P0.** The
  ad-vignette-before-the-AI-call idea stays parked with P2.2 (needs the
  owner's AdSense account).
- ~~**Drag-rank + AI assist.**~~ **Promoted 2026-08-03 — now P5.4 (drag-rank)
  and P5.5 (the assist).** The never-help-them-win constraint moved with it and
  is quoted in full there; it did not soften on the way.
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

**P0–P4 are shipped as of 2026-08-03.** P4 is complete and P2.2's code half is
done and verified.

**The code work now is P5 — the first-timer's pass**, specced in the roadmap
above during the third session on 2026-08-03 and **not started**. It is UI and
two new callables, not mechanism: the allocator, the auditor, and the stored
`partnerEmail` shape are all deliberately untouched by it.

- **Start with P5.4** if you want something that ships today — drag-rank needs
  no key, no callable, and no owner action.
- **Read P5.2 before touching the partner flow.** The dropdown-ordering problem
  is the part that looks simple and is not.
- **Read P5.5's constraint before writing a line of the assist.** It must never
  coach someone toward a winning bid; that is the property the product sells.
- **Read the harness note under "Production failure modes"** before touching
  any copy on the submission form.
- P5.5 needs `ANTHROPIC_API_KEY_ASSIST` — **owner's to create**, deliberately
  separate from P0's key. The reasoning, including which of the usual
  arguments for splitting are factually wrong, is written out in P5.5.

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
PLAYWRIGHT_BROWSERS_PATH=./node_modules/.cache/ms-playwright \
  node verify/e2e-napa-flow.mjs <tripId> <participantCode> <adminCode>
```

---

## Out of scope

**No Terraform.** `firebase.json`, `firestore.rules`, and
`firestore.indexes.json` *are* the IaC. **No user-account system** beyond
magic-link identity binding — codes remain the access model.
