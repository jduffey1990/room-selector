import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  connectAuthEmulator,
} from 'firebase/auth';
import { app } from './firebase';

export const auth = getAuth(app);

// Mirrors the callable emulator switch in firebase.js. The e2e harness cannot
// click a link in a real inbox, so local runs point at the Auth emulator,
// which exposes the generated link over HTTP.
if (import.meta.env.VITE_AUTH_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  console.info('[auth] -> local emulator');
}

const PENDING_KEY = 'rs5000.pendingSubmission';

// A stashed submission older than this is treated as abandoned. The window is
// generous because people check email on their own schedule, but it is not
// unbounded: silently submitting bids a person wrote days ago, against a trip
// whose prices they have since re-read, would be worse than making them retype.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Saves the in-progress submission so it survives the round trip through the
 * user's inbox. Bids live here and nowhere else until the link is clicked --
 * nothing is written server-side before the address is verified.
 *
 * @param {Object} payload Form state plus `email` and `tripId`.
 */
export function stashPending(payload) {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() })
    );
  } catch {
    // Private-mode Safari and friends. Verification still works; the user
    // just re-enters their rankings after clicking through.
  }
}

/**
 * Reads the stashed submission, if one is present and still fresh.
 *
 * @returns {Object|null} The stashed payload, or null.
 */
export function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PENDING_TTL_MS) {
      clearPending();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Removes the stashed submission. */
export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to do; a stale entry expires on its own via PENDING_TTL_MS.
  }
}

/**
 * Emails a sign-in link and stashes the submission to resume afterwards.
 *
 * The link returns to the site root rather than the trip URL: the app uses
 * HashRouter, and Firebase appends its parameters as a query string, which
 * would land them inside the fragment where they cannot be read. The trip is
 * recovered from the stash instead.
 *
 * @param {string} email Address to verify.
 * @param {string} tripId Trip being submitted to.
 * @param {Object} formState Preferences, prices and partner email.
 */
export async function sendVerificationLink(email, tripId, formState) {
  stashPending({ email, tripId, ...formState });
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/`,
    handleCodeInApp: true,
  });
}

/**
 * Whether the current URL is a returning sign-in link.
 *
 * @returns {boolean} True if the link should be completed.
 */
export function isReturningFromLink() {
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Completes sign-in from the emailed link.
 *
 * @returns {Promise<Object|null>} The stashed submission, if any.
 */
export async function completeSignIn() {
  const pending = readPending();
  // Opening the link on a different device than the one that requested it is
  // normal (requested on a laptop, mail read on a phone). Firebase requires
  // the address to confirm the link was not forwarded, so ask for it.
  const email =
    pending?.email ||
    window.prompt('Confirm the email address you entered on the trip page');
  if (!email) {
    throw new Error('That verification needs the email address you entered.');
  }
  await signInWithEmailLink(auth, email, window.location.href);
  return pending;
}
