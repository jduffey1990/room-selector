/**
 * @fileoverview Cascade delete for a trip, and the retention rule that decides
 * which trips are due.
 *
 * One implementation, three callers: the retention cron (P3), the seed
 * script's `--clean`, and P4's delete-trip callable. Deleting a trip touches
 * six places, and a copy that forgets one leaves an orphaned `codes/{code}`
 * document -- a live participant code pointing at a trip that no longer
 * exists. That is exactly the kind of drift CLAUDE.md asks to avoid by
 * extracting rather than duplicating.
 *
 * Lives in functions/ because only functions/ is uploaded on deploy; the seed
 * script reaches in from outside, which is fine because seed/ is never
 * deployed. The reverse would break the deploy.
 *
 * Takes a `db` rather than initializing its own admin app, so it works under
 * the emulator, in a function, and in a script without caring which.
 */

// Firestore caps a batch at 500 operations. Chunk below that: a 10-bed trip
// with 18 submissions and 18 assignments is already ~50 writes, and a large
// trip plus its codes can cross the line. Exceeding it fails the whole batch.
const MAX_BATCH_OPS = 400;

/** Trips are deleted this many months after they end. */
const RETENTION_MONTHS = 6;

/**
 * Trips predating the date fields have no `endDate`, so they fall back to this
 * many months after creation. Longer than the normal window on purpose --
 * `createdAt` is a weaker signal than a real end date, and over-retaining is
 * recoverable where over-deleting is not.
 */
const LEGACY_RETENTION_MONTHS = 12;

/**
 * Commits deletes in chunks that respect the batch limit.
 *
 * @param {Object} db Firestore instance.
 * @param {Array<Object>} refs Document references to delete.
 * @returns {Promise<void>} Resolves when every chunk has committed.
 */
async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += MAX_BATCH_OPS) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + MAX_BATCH_OPS)) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Everything that belongs to one trip, as a flat list of refs.
 *
 * Split out from the delete so a dry run can report exactly what *would* go
 * without touching anything -- the first unattended cron run is required to be
 * a dry run, and a dry run that re-derives the target list separately would be
 * proving something about different code.
 *
 * @param {Object} db Firestore instance.
 * @param {Object} tripRef The trip document reference.
 * @returns {Promise<Object>} `{refs, counts}`.
 */
async function collectTripRefs(db, tripRef) {
  const tripId = tripRef.id;
  const [rooms, subs, assigns, secrets] = await Promise.all([
    db.collection("rooms").where("tripId", "==", tripId).get(),
    db.collection("submissions").where("tripId", "==", tripId).get(),
    db.collection("assignments").where("tripId", "==", tripId).get(),
    tripRef.collection("secret").get(),
  ]);

  const refs = [
    ...rooms.docs.map((d) => d.ref),
    ...subs.docs.map((d) => d.ref),
    ...assigns.docs.map((d) => d.ref),
  ];

  // The reverse-lookup documents are keyed by the code itself, so they can
  // only be found through the secret doc. Miss these and a dead code keeps
  // resolving to a deleted trip.
  let codes = 0;
  for (const sec of secrets.docs) {
    const pc = sec.data().participantCode;
    if (pc) {
      refs.push(db.collection("codes").doc(pc));
      codes++;
    }
    refs.push(sec.ref);
  }

  // Trip doc last: if a chunk fails partway, the trip still exists and the
  // next run retries it. Deleting the trip first would strand the remainder
  // with nothing pointing at it.
  refs.push(tripRef);

  return {
    refs,
    counts: {
      rooms: rooms.size,
      submissions: subs.size,
      assignments: assigns.size,
      codes,
      secrets: secrets.size,
    },
  };
}

/**
 * Deletes a trip and everything hanging off it.
 *
 * @param {Object} db Firestore instance.
 * @param {Object} tripRef The trip document reference.
 * @returns {Promise<Object>} Counts of what was deleted.
 */
async function deleteTripCascade(db, tripRef) {
  const {refs, counts} = await collectTripRefs(db, tripRef);
  await deleteRefs(db, refs);
  return counts;
}

/**
 * The retention rule: when does this trip become eligible for deletion?
 *
 * @param {Object} data The trip document's data.
 * @returns {Object|null} `{dueAt, basis}`, or null if it can never be judged.
 */
function expiryFor(data) {
  const addMonths = (d, n) => {
    const out = new Date(d.getTime());
    out.setMonth(out.getMonth() + n);
    return out;
  };

  if (data.endDate) {
    // Stored as a plain YYYY-MM-DD string. Parsed as UTC midnight, which can
    // sit a few hours either side of the organizer's local midnight --
    // irrelevant against a six-month window.
    const end = new Date(`${data.endDate}T00:00:00Z`);
    if (!Number.isNaN(end.getTime())) {
      return {dueAt: addMonths(end, RETENTION_MONTHS), basis: "endDate"};
    }
  }

  // No optional chaining: the eslint config in functions/ parses at an older
  // ecmaVersion, and the rest of this codebase guards with && for the same
  // reason.
  const created = data.createdAt && typeof data.createdAt.toDate === "function" ?
      data.createdAt.toDate() :
      null;
  if (created) {
    return {
      dueAt: addMonths(created, LEGACY_RETENTION_MONTHS),
      basis: "createdAt (legacy, no endDate)",
    };
  }

  // Neither field: refuse to guess. A trip with no usable timestamp is
  // reported and left alone rather than deleted on a default.
  return null;
}

/**
 * Finds trips whose retention window has passed.
 *
 * `[demo]` fixtures are exempt: they are intentional and are managed by
 * `seed --clean`. Without this the cron would quietly eat the fixtures every
 * other harness depends on.
 *
 * @param {Object} db Firestore instance.
 * @param {Date} now The moment to judge against.
 * @param {Object} [options] `{includeDemo}` to override the exemption.
 * @returns {Promise<Array<Object>>} Expired trips, with the reason each is due.
 */
async function findExpiredTrips(db, now, options = {}) {
  const snap = await db.collection("trips").get();
  const expired = [];
  const unjudgeable = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const isDemo = (data.name || "").startsWith("[demo]");
    if (isDemo && !options.includeDemo) continue;

    const expiry = expiryFor(data);
    if (!expiry) {
      unjudgeable.push({id: doc.id, name: data.name});
      continue;
    }
    if (expiry.dueAt <= now) {
      expired.push({
        ref: doc.ref,
        id: doc.id,
        name: data.name || "(unnamed)",
        dueAt: expiry.dueAt,
        basis: expiry.basis,
      });
    }
  }

  return {expired, unjudgeable};
}

module.exports = {
  deleteTripCascade,
  collectTripRefs,
  findExpiredTrips,
  expiryFor,
  RETENTION_MONTHS,
  LEGACY_RETENTION_MONTHS,
};
