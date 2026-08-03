#!/usr/bin/env node
/**
 * Proves the P1.1 acceptance criterion against the callable itself, not the
 * UI: "a submission without a verified session is rejected by the callable".
 *
 * Runs against the Functions + Auth emulators. The Functions emulator reaches
 * real Firestore through the Admin SDK (see the note in src/firebase.js), so
 * this exercises the production data path and cleans up after itself.
 *
 *   firebase emulators:start --only auth,functions
 *   node verify/local-auth-enforcement.mjs
 *
 * Exits non-zero on the first failed expectation.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('../seed/node_modules/firebase-admin');
const serviceAccount = require('../seed/serviceAccountKey.json');

const PROJECT = 'room-selector';
const AUTH_EMU = 'http://127.0.0.1:9099';
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1/submitPreferences`;
const TEST_EMAIL = `demo-authcheck@example.com`;

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok' : 'FAIL'}: ${what}`);
  if (!ok) failures++;
};

/** Calls the callable over HTTP, optionally bearing an ID token. */
async function callSubmit(data, idToken) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/**
 * Signs in through the real email-link flow against the Auth emulator, which
 * exposes generated codes over HTTP instead of sending mail. This is the same
 * path production uses -- notably it is what makes email_verified true, which
 * a password signup does not.
 */
async function emulatorIdToken(email) {
  const idp = `${AUTH_EMU}/identitytoolkit.googleapis.com/v1`;

  const sent = await fetch(`${idp}/accounts:sendOobCode?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      requestType: 'EMAIL_SIGNIN',
      email,
      continueUrl: 'http://localhost:5173/',
    }),
  });
  if (!sent.ok) {
    throw new Error(`sendOobCode failed: ${JSON.stringify(await sent.json())}`);
  }

  const inbox = await fetch(`${AUTH_EMU}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes = [] } = await inbox.json();
  const mine = oobCodes.filter((c) => c.email === email).pop();
  if (!mine) throw new Error(`no oobCode issued for ${email}`);

  const res = await fetch(`${idp}/accounts:signInWithEmailLink?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, oobCode: mine.oobCode }),
  });
  const body = await res.json();
  if (!body.idToken) {
    throw new Error(`signInWithEmailLink failed: ${JSON.stringify(body)}`);
  }
  return body.idToken;
}

// A [demo] trip supplies real room ids; bids must price every room and sum to
// zero, so the payload is built from the fixture rather than hardcoded.
const tripsSnap = await db.collection('trips').get();
const trip = tripsSnap.docs.find((d) => (d.data().name || '').startsWith('[demo]'));
if (!trip) {
  console.error('No [demo] trip found. Run: node seed/seed-demo-trips.js');
  process.exit(1);
}
const roomsSnap = await db.collection('rooms').where('tripId', '==', trip.id).get();
const rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const roomPrices = rooms.map((r) => ({ id: r.id, price: r.basePrice }));

console.log(`trip: ${trip.data().name} (${trip.id}), ${rooms.length} rooms\n`);

const payload = {
  tripId: trip.id,
  preferences: rooms.slice(0, 2).map((r) => r.id),
  roomPrices,
  // Required since P5.2. partnerEmail is deliberately absent: the callable no
  // longer accepts one from a client at all, and passing it would prove
  // nothing about the check this harness exists to make.
  displayName: 'Auth Check',
};

// 1. No token at all.
console.log('unauthenticated call:');
const anon = await callSubmit(payload);
check(anon.status !== 200, `rejected (HTTP ${anon.status})`);
check(
  anon.body?.error?.status === 'UNAUTHENTICATED',
  `error status is UNAUTHENTICATED (got ${anon.body?.error?.status})`
);

// 2. Body-supplied email must not be honoured.
console.log('\nunauthenticated call carrying an email in the body:');
const spoof = await callSubmit({ ...payload, email: 'victim@example.com' });
check(spoof.status !== 200, `still rejected (HTTP ${spoof.status})`);
const victimDupe = await db
  .collection('submissions')
  .where('tripId', '==', trip.id)
  .where('email', '==', 'victim@example.com')
  .get();
check(victimDupe.empty, 'no submission was written for the spoofed address');

// 3. Verified token succeeds, and the stored email comes from the token.
console.log('\nauthenticated call:');
const idToken = await emulatorIdToken(TEST_EMAIL);
const good = await callSubmit({ ...payload, email: 'victim@example.com' }, idToken);
check(good.status === 200, `accepted (HTTP ${good.status})`);

const written = await db
  .collection('submissions')
  .where('tripId', '==', trip.id)
  .where('email', '==', TEST_EMAIL)
  .get();
check(!written.empty, `submission stored under the token address ${TEST_EMAIL}`);

const spoofedAfter = await db
  .collection('submissions')
  .where('tripId', '==', trip.id)
  .where('email', '==', 'victim@example.com')
  .get();
check(
  spoofedAfter.empty,
  'body email was ignored even on the accepted call'
);

// Cleanup: this harness must leave no submission behind.
const mine = await db
  .collection('submissions')
  .where('tripId', '==', trip.id)
  .where('email', '==', TEST_EMAIL)
  .get();
await Promise.all(mine.docs.map((d) => d.ref.delete()));
console.log(`\ncleaned up ${mine.size} test submission(s)`);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
