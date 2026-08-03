import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase';

// App Check (P2.3). createTrip and extractListing are unauthenticated and
// spammable, and extractListing costs money per call, so the callables need a
// way to tell a browser running our app from a script running curl.
//
// The site key is PUBLIC -- it ships in every client bundle, exactly like the
// Firebase apiKey. The matching secret key is registered once in the Firebase
// console and never appears here.
//
// Which provider depends on which console the key came from. Classic
// reCAPTCHA v3 (google.com/recaptcha/admin) and reCAPTCHA Enterprise (Cloud
// console) mint incompatible keys and need different providers -- passing an
// Enterprise key to ReCaptchaV3Provider fails at token-fetch time with a
// generic error, so this is set deliberately rather than guessed.
// Confirmed classic v3, not Enterprise: the project's App Check config has a
// populated recaptchaV3Config ("siteSecretSet": true), and the Enterprise
// resource is a different path entirely. The two mint identical-looking 40-char
// keys, so this was checked rather than inferred from the string.
const PROVIDER = 'v3'; // 'v3' | 'enterprise'

// Hardcoded on purpose, like the Firebase config in firebase.js. This key is
// public — it ships in every bundle and grants nothing on its own; the secret
// half lives in the project's App Check config and never appears here.
//
// Read from an env var it would be a footgun: Vite inlines env vars at BUILD
// time, so any build that forgot the variable would silently produce a bundle
// with App Check disabled. Once enforcement is on, that ships a site where
// every callable fails, with nothing in the deploy log to suggest why.
const SITE_KEY = '6LcH5XMtAAAAADQ57PkAzYE8a-3p-S1ROFxaeAip';

/**
 * Starts App Check if a site key is configured.
 *
 * Absent a key this is a no-op and the app behaves exactly as it does today.
 * That is deliberate and matches how the Anthropic and Brevo keys degrade: a
 * missing credential must never be the reason a trip cannot be created. It
 * also means a local dev build with no key set still works.
 *
 * @returns {boolean} True if App Check was initialized.
 */
export function startAppCheck() {
  if (!SITE_KEY) {
    console.info('[appcheck] no site key configured — skipping');
    return false;
  }

  try {
    initializeAppCheck(app, {
      provider: PROVIDER === 'enterprise'
        ? new ReCaptchaEnterpriseProvider(SITE_KEY)
        : new ReCaptchaV3Provider(SITE_KEY),
      // Refresh before expiry so a long-lived tab does not start failing
      // callables partway through someone filling in the submission form.
      isTokenAutoRefreshEnabled: true,
    });
    console.info(`[appcheck] initialized (${PROVIDER})`);
    return true;
  } catch (err) {
    // Never let App Check setup break the page. Enforcement is off until
    // tokens are confirmed flowing, so a failure here degrades to the current
    // behaviour rather than locking everyone out.
    console.error('[appcheck] failed to initialize:', err);
    return false;
  }
}
