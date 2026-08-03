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
| Test harnesses | `verify/e2e-napa-flow.mjs` (production e2e; `--discriminating` proves which allocator is live), `verify/regression-envyfree.cjs` (18/18 vs reference), `verify/simulate-envyfree.cjs` (576 trips, zero envy — results in `verify/simulation-results.md`), `verify/preview-results-email.cjs` (email rendering; `--send` posts one real message), `verify/local-auth-enforcement.mjs` + `verify/local-magiclink-flow.mjs` (emulator-only; see README "Local stack") |
| Firebase Auth | **Enabled 2026-08-03** (owner, via Cloud Shell — see P1.1). Email/Password + passwordless on; both `roomselector5000.com` hostnames in `authorizedDomains`. Legacy Firebase Auth, not Identity Platform. |
| Email | **DEPLOYED 2026-08-03.** Magic-link verification enforced (`submitPreferences` returns 401 to an unauthenticated `curl`, verified in production), results email sends at finalization. Auth email goes via Brevo from `noreply@roomselector5000.com` and **lands in the inbox** — P1.4 resolved. |
| Listing import | **DEPLOYED 2026-08-03.** `extractListing` (7th callable) on `claude-haiku-4-5`, ~$0.0026/call. Verified end to end in production: pasted listing → populated create form, 3.3s mobile / 4.8s desktop, zero console errors. |
| Trip lifecycle (P4) | **Partly shipped 2026-08-03.** Callables live: `updateTrip`, `closeSubmissions`, `removeSubmission`, `reopenTrip`, `deleteTrip` — all admin-gated. Dashboard UI for close/reopen/remove/delete, verified in production. **Two gaps: `updateTrip` has no dashboard form, and reopen→re-allocate has not been exercised end to end.** |
| Trip dates | **Collected 2026-08-03** (optional `startDate`/`endDate`, YYYY-MM-DD strings on the trip doc). |
| Retention (P3) | **Cron deployed, DRY RUN.** `purgeExpiredTrips`, monthly 09:00 UTC on the 1st. Deletes nothing until `RETENTION_ENABLED=true`. Cascade extracted to `functions/trip-cascade.js` and shared with `seed --clean`. |
| Privacy policy + terms | **DEPLOYED 2026-08-03** (P2.1). `/#/privacy` and `/#/terms`, linked from a footer on every route. **Two open obligations: `privacy@roomselector5000.com` must route to a real inbox, and the policy promises 6-month deletion that P3 has not implemented yet.** |
| App Check | **ENFORCED 2026-08-03** (P2.3) on six of seven callables via classic reCAPTCHA v3. `getResults` deliberately open — it is opened from the results email, often days later in a mail client's in-app browser where reCAPTCHA scores poorly, and blocking someone from seeing what they owe is worse than a scraper reading an already-shared page. Raw `curl` → 401 on the six, 400 on `getResults`. **The e2e harness needs `APPCHECK_DEBUG_TOKEN` (registered debug token, never committed) or every submission is rejected.** |
| Ads | None yet — P2.2, needs the owner's AdSense account. |

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
Rotated once already (owner, 2026-08-03). The order is always: rotate in Brevo
→ re-run the PATCH → send a test `sendOobCode` and confirm it lands.

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

- ~~**Listing import.**~~ **Promoted 2026-08-03 — now P0.** The
  ad-vignette-before-the-AI-call idea stays parked with P2.2 (needs the
  owner's AdSense account).
- **Drag-rank + AI assist.** The assist helps someone *express what they
  actually want*. It must never help them *win*: the mechanism is not
  strategyproof, and coaching bid-shading would break the exact property
  the product sells. If a user asks how to game it, the honest answer is
  that bidding true values is what makes the result defensible.
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

**As of 2026-08-03 the roadmap above is shipped except for two P4 gaps and
P2.2.** Start here:

1. **Finish P4** — the only unblocked code work left.
   - `updateTrip` has no dashboard form. The callable is deployed and
     verified; an organizer simply cannot reach "edit trip/rooms".
   - Exercise **reopen → re-allocate** end to end and confirm the result is
     still envy-free. Reopen is verified to clear assignments and reset
     status; the composition with `allocateRooms` is untested.
2. **P2.2 AdSense** — blocked on the owner's account (in progress
   2026-08-03). When the publisher ID arrives: `ads.txt` at the domain root
   (a build-output change, not a paste), the AdSense snippet, then Auto ads
   with vignettes on and in-page/anchored off. The ad constraints in P2.2 are
   hard requirements, not preferences.

Everything below is history unless something regresses.
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
