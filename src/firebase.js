import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';

// This config is NOT a secret. The apiKey is an identifier that ships in the
// bundle of every Firebase web app and grants nothing on its own — access
// control lives entirely in firestore.rules and the callable functions.
const firebaseConfig = {
  apiKey: "AIzaSyAsD7jF_9vkhQfOMkQnIVN7LPDyxqMPIN8",
  authDomain: "room-selector.firebaseapp.com",
  projectId: "room-selector",
  storageBucket: "room-selector.firebasestorage.app",
  messagingSenderId: "663251955322",
  appId: "1:663251955322:web:9e90424704a6731c0655c3",
  measurementId: "G-S1WZV80GNX"
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const functions = getFunctions(app);

// VITE_USE_EMULATOR=true routes callables and Firestore to
// `firebase emulators:start`, so the app can be exercised end to end before
// anything is deployed.
//
// Firestore must move with the callables once auth is in play: a browser
// signed in against the Auth emulator holds a token signed `alg: none`, which
// production Firestore correctly refuses. Mixing the two produces "Missing or
// insufficient permissions" on reads that are in fact public. The emulator
// loads firestore.rules, so local runs still exercise the real rules.
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.info('[firebase] callables + firestore -> local emulator');
}

/**
 * Calls a callable Cloud Function and unwraps `.data`.
 *
 * Every write and every read of participant data goes through one of these —
 * firestore.rules denies clients direct access. Errors arrive as FirebaseError
 * with a `code` like "functions/permission-denied"; `message` is the string the
 * function threw and is safe to show a user.
 *
 * @param {string} name Callable function name.
 * @param {Object} [payload] Arguments for the function.
 * @returns {Promise<Object>} The function's return value.
 */
export async function callFn(name, payload = {}) {
  const result = await httpsCallable(functions, name)(payload);
  return result.data;
}
