// AdSense Auto ads loader (P2.2).
//
// The owner's decision: monetize navigation boundaries -- after creating a
// trip, after joining one -- and keep the pages themselves bespoke. The hard
// constraint that falls out of that is "no ads inside money or fairness UI:
// nothing between a person and the number they pay."
//
// What can and cannot be enforced in code, measured 2026-08-03:
//
//   Auto ads FORMAT toggles (vignette on; in-page/banner, multiplex, anchor,
//   side rail, ad intents off) live in the AdSense UI only. There is no
//   page-level parameter for them -- `enable_page_level_ads` is legacy and
//   replaced by account-side Auto ads settings. AdSense's "excluded areas"
//   feature is also UI-side, and Google documents that it "only applies to
//   in-page Auto ads... won't prevent overlay ads such as anchor ads."
//
// So account settings cannot be the guarantee. The one lever this code owns is
// WHERE THE SCRIPT EXISTS. A route that never loads adsbygoogle.js cannot show
// an ad in any format, whatever the account is set to. That is the enforcement
// mechanism here, and it is why the verification tag in index.html is the meta
// tag rather than the <script> snippet.

const PUBLISHER_ID = 'ca-pub-6539967757276332';
const LOADER_ID = 'adsense-auto-ads';
const LOADER_SRC =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;

// Routes that may load ad code. Everything not listed here is denied -- the
// default is no ads, so a route added later is ad-free until someone
// deliberately puts it on this list.
//
// /create and /join are on it because a vignette is an interstitial shown as
// the reader LEAVES a page. "After you create a trip" and "after you join one"
// are transitions out of these two, so the script has to be live here for the
// boundary to be monetizable at all. The destinations stay clean.
const AD_ELIGIBLE = ['/', '/create', '/join', '/privacy', '/terms'];

// Money and fairness UI, named so the reason is readable at the deny site:
//   /trip/:tripId    bid controls and price adjustments
//   /admin/:tripId   price balance, allocation trigger
//   /results/:tripId assignments and the exact dollar figure each person owes
// These are not merely absent from AD_ELIGIBLE; they are the reason it exists.

export function isAdEligible(pathname) {
  return AD_ELIGIBLE.includes(pathname);
}

// Injected once per document and never re-injected. AdSense emits "Only one
// AdSense head tag supported per page" if the loader is added twice, which
// would show up as a console error -- and this repo asserts zero of those.
let injected = false;

export function syncAds(pathname) {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById(LOADER_ID);

  if (!isAdEligible(pathname)) {
    // Remove the tag on the way into money UI. Honest about what this buys:
    // once adsbygoogle.js has executed, removing its <script> element does not
    // unload it. The real guarantee is the branch below never running on a
    // fresh load of a money route -- which is the common case, because results
    // links arrive by email and trip links by text, landing directly there.
    // This removal is the weaker in-session half, kept because it costs
    // nothing and makes the DOM state match the intent.
    if (existing) existing.remove();
    return;
  }

  if (existing || injected) return;

  const script = document.createElement('script');
  script.id = LOADER_ID;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = LOADER_SRC;
  // A blocked loader (ad blocker, no network, site not yet approved) must not
  // surface as an unhandled error. Nothing on the page depends on it.
  script.onerror = () => {};
  document.head.appendChild(script);
  injected = true;
}

// Exported for the placement harness (verify/ads-placement.mjs), so the test
// and the implementation cannot drift apart on what "ad eligible" means.
export const __adsInternals = { PUBLISHER_ID, LOADER_ID, LOADER_SRC, AD_ELIGIBLE };
