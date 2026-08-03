const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
// Import FieldValue from the modular entry point rather than reaching through
// admin.firestore. The Functions emulator wraps firebase-admin to redirect
// Firestore, and that proxy drops static properties, so
// admin.firestore.FieldValue is undefined under emulation.
const {FieldValue} = require("firebase-admin/firestore");
const crypto = require("crypto");
const {computeAllocation} = require("./allocation");
const {sendResultsEmails} = require("./email");
const listingImport = require("./listing-import");
const cascade = require("./trip-cascade");

admin.initializeApp();
const db = admin.firestore();

// GCP budgets only alert -- they never cap spend. Capping concurrency is the
// practical guard against a runaway loop or a scraper running up a bill.
//
// App Check ENFORCED (P2.3, 2026-08-03). Turned on only after a real browser
// was confirmed exchanging tokens and the e2e harness was confirmed passing
// with a registered debug token -- enforcing first would have broken the tool
// that proves enforcement works.
const opts = {maxInstances: 10, enforceAppCheck: true};

// getResults is deliberately NOT enforced. It is what a participant opens from
// the results email, possibly days later and often inside a mail client's
// in-app browser, where reCAPTCHA scores poorly. Blocking someone from seeing
// what they owe is a worse outcome than a scraper reading a results page that
// was already shared with everyone on the trip. The spam-and-cost targets are
// createTrip and extractListing, and both are enforced.
const openOpts = {...opts, enforceAppCheck: false};

// Ambiguous characters (0/O, 1/I/L) removed: these get read aloud and retyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Cryptographically secure trip code. Math.random() is not acceptable here --
 * the code IS the password for a trip. 256 % 32 === 0, so indexing the
 * 32-character alphabet by a random byte is free of modulo bias.
 * @param {number} length Number of characters to generate.
 * @return {string} The generated code.
 */
function generateCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Reads the private codes document for a trip.
 * @param {string} tripId Trip document id.
 * @return {!Promise<!Object>} The stored codes.
 */
async function readCodes(tripId) {
  const snap = await db.collection("trips").doc(tripId)
      .collection("secret").doc("codes").get();
  if (!snap.exists) throw new HttpsError("not-found", "Trip not found");
  return snap.data();
}

/**
 * Verifies an admin code server-side. This is the check that used to live in
 * the browser, where it required the code to be world-readable.
 * @param {string} tripId Trip document id.
 * @param {string} adminCode Code supplied by the caller.
 * @return {!Promise<!Object>} The stored codes, once verified.
 */
async function requireAdmin(tripId, adminCode) {
  if (!tripId || !adminCode) {
    throw new HttpsError("invalid-argument", "tripId and adminCode required");
  }
  const codes = await readCodes(tripId);
  if (codes.adminCode !== adminCode) {
    throw new HttpsError("permission-denied", "Invalid admin code");
  }
  return codes;
}

// Listing import calls a paid API and, like createTrip, is unauthenticated --
// so it is a spam target with a bill attached. maxInstances caps the blast
// radius until App Check (P2.3) covers it properly.
// timeoutSeconds is raised from the 60s default: plain sample text took 11.7s
// measured, and a multi-page PDF is meaningfully slower. A timeout here reads
// to the organizer as "it just didn't work" with nothing to act on.
const extractOpts = {
  ...opts,
  maxInstances: 3,
  timeoutSeconds: 180,
  secrets: ["ANTHROPIC_API_KEY"],
};

/**
 * Reads a listing and returns a DRAFT trip. Writes nothing.
 *
 * The organizer reviews and edits, then submits through createTrip like any
 * other trip. Nothing here is authoritative -- if this fails, the create form
 * is unchanged and still works by hand, which is why every failure below is a
 * plain message rather than something the UI has to special-case.
 */
exports.extractListing = onCall(extractOpts, async (request) => {
  if (!listingImport.isConfigured()) {
    throw new HttpsError("failed-precondition",
        "Listing import is not set up yet. Add the beds by hand below.");
  }

  const {text, fileData, mediaType} = request.data || {};

  if (fileData) {
    if (typeof fileData !== "string") {
      throw new HttpsError("invalid-argument", "Could not read that file");
    }
    if (!listingImport.SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
      throw new HttpsError("invalid-argument",
          "Upload a PDF, or a screenshot as PNG or JPEG");
    }
    // base64 inflates by 4/3; compare decoded size so the limit means what
    // the error message says it means.
    if ((fileData.length * 3) / 4 > listingImport.MAX_FILE_BYTES) {
      throw new HttpsError("invalid-argument",
          "That file is larger than 3 MB. Upload just the pages listing the " +
          "bedrooms.");
    }
  } else if (typeof text === "string" && text.trim()) {
    if (text.length > listingImport.MAX_TEXT_CHARS) {
      throw new HttpsError("invalid-argument",
          "That listing is too long. Paste just the section describing the " +
          "bedrooms.");
    }
  } else {
    throw new HttpsError("invalid-argument",
        "Paste the listing text or upload a file");
  }

  try {
    return await listingImport.extractListing({text, fileData, mediaType});
  } catch (err) {
    // The full error goes to logs; the organizer gets something they can act
    // on. A stack trace in a form field helps nobody.
    console.error("Listing extraction failed:", err);
    throw new HttpsError("internal", err instanceof Error && err.message ?
        err.message :
        "Could not read that listing. Add the beds by hand below.");
  }
});

// YYYY-MM-DD or nothing. Stored as a plain string rather than a Timestamp:
// a trip's end date is a calendar day, not an instant, and converting to a
// Timestamp would silently bind it to whatever timezone the server ran in.
const isDateString = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

exports.createTrip = onCall(opts, async (request) => {
  const {name, totalTripCost, rooms, startDate, endDate} = request.data || {};

  if (typeof name !== "string" || !name.trim()) {
    throw new HttpsError("invalid-argument", "Trip name required");
  }
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new HttpsError("invalid-argument", "At least one room required");
  }
  if (rooms.length > 50) {
    throw new HttpsError("invalid-argument", "Too many rooms (max 50)");
  }
  if (rooms.some((r) => !r || typeof r.name !== "string" || !r.name.trim())) {
    throw new HttpsError("invalid-argument", "Every room needs a name");
  }

  const adminCode = generateCode(10);
  const participantCode = generateCode(8);
  const tripRef = db.collection("trips").doc();
  const batch = db.batch();

  // Public document: deliberately holds no codes and no emails, because
  // firestore.rules allows the world to read it.
  batch.set(tripRef, {
    name: name.trim().slice(0, 120),
    totalTripCost: Number(totalTripCost) || 0,
    status: "collecting",
    // Dates are optional so existing clients keep working. endDate is what
    // the retention rule (P3) measures from; without it a trip falls back to
    // the longer createdAt window.
    startDate: isDateString(startDate) ? startDate : null,
    endDate: isDateString(endDate) ? endDate : null,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(tripRef.collection("secret").doc("codes"),
      {adminCode, participantCode});

  // Reverse lookup so joinTrip is a single keyed get, with the code as the
  // document id rather than a queryable field.
  batch.set(db.collection("codes").doc(participantCode),
      {tripId: tripRef.id, role: "participant"});

  for (const room of rooms) {
    batch.set(db.collection("rooms").doc(), {
      tripId: tripRef.id,
      name: String(room.name).trim().slice(0, 120),
      description: String(room.description || "").slice(0, 300),
      basePrice: Number(room.basePrice) || 0,
      capacity: Math.max(1, parseInt(room.capacity, 10) || 1),
      type: String(room.type || "other"),
    });
  }

  await batch.commit();
  return {tripId: tripRef.id, adminCode, participantCode};
});

exports.joinTrip = onCall(opts, async (request) => {
  const code = String((request.data || {}).participantCode || "")
      .trim().toUpperCase();
  if (!code) throw new HttpsError("invalid-argument", "Code required");

  const snap = await db.collection("codes").doc(code).get();
  if (!snap.exists) throw new HttpsError("not-found", "Trip not found");
  return {tripId: snap.data().tripId};
});

exports.submitPreferences = onCall(opts, async (request) => {
  const {tripId, preferences, roomPrices, partnerEmail} = request.data || {};

  // Identity comes from the verified token, never from the request body
  // (P1.1 Option A). This is structural rather than a check: there is no
  // unverified path to reject because one cannot be expressed. An envy-free
  // allocation over forged ballots is fairly allocating fiction.
  const token = (request.auth && request.auth.token) || null;
  const cleanEmail = String((token && token.email) || "").toLowerCase().trim();
  if (!cleanEmail) {
    throw new HttpsError("unauthenticated",
        "Verify your email address before submitting");
  }
  if (token.email_verified === false) {
    throw new HttpsError("permission-denied",
        "Verify your email address before submitting");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new HttpsError("invalid-argument", "Valid email required");
  }

  // Optional bed-sharing declaration (P1.2). A couple only forms when the
  // named partner's submission names this email back — enforced at
  // allocation time, stored verbatim here.
  const cleanPartner = String(partnerEmail || "").toLowerCase().trim();
  if (cleanPartner) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanPartner)) {
      throw new HttpsError("invalid-argument", "Valid partner email required");
    }
    if (cleanPartner === cleanEmail) {
      throw new HttpsError("invalid-argument",
          "Partner email must be a different person");
    }
  }
  if (!Array.isArray(preferences) || preferences.length === 0) {
    throw new HttpsError("invalid-argument", "Rank at least one room");
  }
  if (!Array.isArray(roomPrices) || roomPrices.length === 0) {
    throw new HttpsError("invalid-argument", "Room prices required");
  }

  const tripSnap = await db.collection("trips").doc(String(tripId || "")).get();
  if (!tripSnap.exists) throw new HttpsError("not-found", "Trip not found");
  if (tripSnap.data().status === "finalized") {
    throw new HttpsError("failed-precondition", "Trip is already finalized");
  }

  // Bids must refer to real rooms on THIS trip, or a caller could inject
  // fabricated room ids and skew the allocation.
  const roomsSnap = await db.collection("rooms")
      .where("tripId", "==", tripSnap.id).get();
  const valid = new Map(roomsSnap.docs.map((d) => [d.id, d.data()]));
  if (roomPrices.length !== valid.size) {
    throw new HttpsError("invalid-argument", "Must price every room");
  }
  for (const rp of roomPrices) {
    if (!rp || !valid.has(rp.id)) {
      throw new HttpsError("invalid-argument", "Unknown room in submission");
    }
    if (!Number.isFinite(Number(rp.price))) {
      throw new HttpsError("invalid-argument", "Non-numeric price");
    }
  }
  for (const id of preferences) {
    if (!valid.has(id)) {
      throw new HttpsError("invalid-argument", "Unknown room in preferences");
    }
  }

  // Zero-sum rule, enforced here rather than in the browser. The client-side
  // check is a convenience; this is the control.
  const totalAdjustment = roomPrices.reduce(
      (sum, rp) => sum + (Number(rp.price) - valid.get(rp.id).basePrice), 0);
  if (Math.abs(totalAdjustment) > 0.01) {
    throw new HttpsError("invalid-argument",
        `Price adjustments must sum to zero (got ${totalAdjustment})`);
  }

  const dupe = await db.collection("submissions")
      .where("tripId", "==", tripSnap.id)
      .where("email", "==", cleanEmail).limit(1).get();
  if (!dupe.empty) {
    throw new HttpsError("already-exists", "This email already submitted");
  }

  await db.collection("submissions").add({
    tripId: tripSnap.id,
    email: cleanEmail,
    partnerEmail: cleanPartner || null,
    preferences,
    roomPrices: roomPrices.map((rp) => ({
      id: rp.id,
      name: valid.get(rp.id).name,
      price: Number(rp.price),
      basePrice: valid.get(rp.id).basePrice,
    })),
    totalAdjustment,
    timestamp: new Date().toISOString(),
  });

  return {success: true};
});

exports.getAdminData = onCall(opts, async (request) => {
  const {tripId, adminCode} = request.data || {};
  const codes = await requireAdmin(tripId, adminCode);

  const [tripSnap, roomsSnap, subsSnap] = await Promise.all([
    db.collection("trips").doc(tripId).get(),
    db.collection("rooms").where("tripId", "==", tripId).get(),
    db.collection("submissions").where("tripId", "==", tripId).get(),
  ]);

  return {
    trip: {id: tripSnap.id, ...tripSnap.data()},
    participantCode: codes.participantCode,
    rooms: roomsSnap.docs.map((d) => ({id: d.id, ...d.data()})),
    submissions: subsSnap.docs.map((d) => ({id: d.id, ...d.data()})),
  };
});

exports.getResults = onCall(openOpts, async (request) => {
  const {tripId, code} = request.data || {};
  if (!tripId || !code) {
    throw new HttpsError("invalid-argument", "tripId and code required");
  }
  // Results carry emails, so either code grants access but an anonymous
  // caller gets nothing.
  const codes = await readCodes(tripId);
  if (code !== codes.adminCode && code !== codes.participantCode) {
    throw new HttpsError("permission-denied", "Invalid code");
  }

  const snap = await db.collection("assignments")
      .where("tripId", "==", tripId).get();
  return {assignments: snap.docs.map((d) => ({id: d.id, ...d.data()}))};
});

// The results email is the one non-optional notification (CLAUDE.md P1.2):
// without it the organizer hand-delivers figures to everyone. The key is a
// functions secret; when it is absent the send is skipped, not failed.
const allocateOpts = {...opts, secrets: ["BREVO_API_KEY"]};

exports.allocateRooms = onCall(allocateOpts, async (request) => {
  const {tripId, adminCode} = request.data || {};

  try {
    // Codes moved to trips/{id}/secret/codes, which no client can read.
    const codes = await requireAdmin(tripId, adminCode);

    const tripDoc = await db.collection("trips").doc(tripId).get();
    if (!tripDoc.exists) {
      throw new HttpsError("not-found", "Trip not found");
    }

    const trip = {id: tripDoc.id, ...tripDoc.data()};

    if (trip.status === "finalized") {
      throw new HttpsError("failed-precondition", "Trip already finalized");
    }

    const [roomsSnapshot, submissionsSnapshot] = await Promise.all([
      db.collection("rooms").where("tripId", "==", tripId).get(),
      db.collection("submissions").where("tripId", "==", tripId).get(),
    ]);

    // The algorithm itself lives in allocation.js and touches no I/O.
    const {assignments: allAssignments, coupleCount, singleCount} =
        computeAllocation(
            roomsSnapshot.docs.map((d) => ({id: d.id, ...d.data()})),
            submissionsSnapshot.docs.map((d) => d.data()));

    // Write to Firestore in batch
    const batch = db.batch();

    // Delete existing assignments
    const existingAssignments = await db.collection("assignments")
        .where("tripId", "==", tripId)
        .get();

    existingAssignments.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // The trip stores a total, not a per-person figure. Everything up to here
    // used bed capacity as an estimate; now that submissions are in, split by
    // the real headcount so the group collects exactly totalTripCost.
    const headcount = allAssignments.reduce(
        (n, a) => n + a.emails.length, 0);
    const basePerPerson = headcount > 0 ?
        (Number(trip.totalTripCost) || 0) / headcount : 0;

    // Create new assignments. The same rows feed the results email, so what
    // someone is told they owe is literally the committed figure.
    const emailRows = [];
    for (const assignment of allAssignments) {
      const assignmentRef = db.collection("assignments").doc();
      const row = {
        tripId: tripId,
        emails: assignment.emails,
        roomNames: assignment.beds,
        roomIds: assignment.bedIds,
        bedClass: assignment.bedClass,
        priceAdjustment: assignment.finalPerPerson,
        totalPerPerson: basePerPerson + assignment.finalPerPerson,
      };
      batch.set(assignmentRef, {...row, createdAt: FieldValue.serverTimestamp()});
      emailRows.push(row);
    }

    // Update trip status
    const tripRef = db.collection("trips").doc(tripId);
    batch.update(tripRef, {
      status: "finalized",
      finalizedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Only after the batch commits: the allocation is the product, the email
    // is a report about it. sendResultsEmails never rejects, but the extra
    // guard means a future change to it still cannot fail an allocation.
    let email = {sent: 0, failed: 0, skipped: true};
    try {
      email = await sendResultsEmails({
        tripId,
        tripName: trip.name,
        participantCode: codes.participantCode,
        assignments: emailRows,
      });
    } catch (mailError) {
      console.error("Results email failed (allocation stands):", mailError);
    }

    return {
      success: true,
      message: "Allocation complete",
      assignmentCount: allAssignments.length,
      coupleCount,
      singleCount,
      emailsSent: email.sent,
      emailsFailed: email.failed,
      emailSkipped: email.skipped,
    };
  } catch (error) {
    console.error("Allocation error:", error);
    // Preserve typed errors. Re-wrapping them as "internal" hid the actual
    // cause (invalid code, already finalized) from the dashboard.
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message);
  }
});
// Retention (P3). The privacy policy promises deletion 6 months after a trip
// ends, so this is a published commitment rather than housekeeping.
//
// DRY RUN BY DEFAULT. CLAUDE.md requires the first unattended run to only log
// what it would delete; actual deletion turns on when the owner sets
// RETENTION_ENABLED=true after reading a log. The flag defaults to off so
// forgetting to set it fails safe -- the cron reports and deletes nothing.
exports.purgeExpiredTrips = onSchedule({
  schedule: "0 9 1 * *", // 09:00 UTC on the 1st of each month
  timeZone: "UTC",
  ...opts,
}, async () => {
  const armed = process.env.RETENTION_ENABLED === "true";
  const now = new Date();
  const {expired, unjudgeable} = await cascade.findExpiredTrips(db, now);

  console.log(`[retention] ${armed ? "ARMED" : "DRY RUN"} at ${now.toISOString()}: ` +
      `${expired.length} expired, ${unjudgeable.length} unjudgeable`);

  for (const trip of unjudgeable) {
    // Neither endDate nor createdAt. Reported, never guessed at.
    console.warn(`[retention] SKIP ${trip.id} "${trip.name}" — no usable date`);
  }

  for (const trip of expired) {
    // Count the cascade even in a dry run, so the log the owner reviews shows
    // real blast radius rather than just a trip name.
    const {counts} = await cascade.collectTripRefs(db, trip.ref);
    const detail = `${counts.rooms} rooms, ${counts.submissions} submissions, ` +
        `${counts.assignments} assignments, ${counts.codes} codes`;
    console.log(`[retention] ${armed ? "DELETING" : "would delete"} ${trip.id} ` +
        `"${trip.name}" — due ${trip.dueAt.toISOString().slice(0, 10)} ` +
        `by ${trip.basis} (${detail})`);
    if (armed) await cascade.deleteTripCascade(db, trip.ref);
  }

  console.log(`[retention] done. ${armed ? "deleted" : "would delete"} ` +
      `${expired.length} trip(s).`);
});
