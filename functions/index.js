const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {computeAllocation} = require("./allocation");

admin.initializeApp();
const db = admin.firestore();

// GCP budgets only alert -- they never cap spend. Capping concurrency is the
// practical guard against a runaway loop or a scraper running up a bill.
const opts = {maxInstances: 10};

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

exports.createTrip = onCall(opts, async (request) => {
  const {name, totalTripCost, rooms} = request.data || {};

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
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
  const {tripId, email, preferences, roomPrices} = request.data || {};

  const cleanEmail = String(email || "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new HttpsError("invalid-argument", "Valid email required");
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

exports.getResults = onCall(opts, async (request) => {
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

exports.allocateRooms = onCall(opts, async (request) => {
  const {tripId, adminCode} = request.data || {};

  try {
    // Codes moved to trips/{id}/secret/codes, which no client can read.
    await requireAdmin(tripId, adminCode);

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

    // Create new assignments
    for (const assignment of allAssignments) {
      const assignmentRef = db.collection("assignments").doc();
      batch.set(assignmentRef, {
        tripId: tripId,
        emails: assignment.emails,
        roomNames: assignment.beds,
        roomIds: assignment.bedIds,
        bedClass: assignment.bedClass,
        priceAdjustment: assignment.finalPerPerson,
        totalPerPerson: basePerPerson + assignment.finalPerPerson,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Update trip status
    const tripRef = db.collection("trips").doc(tripId);
    batch.update(tripRef, {
      status: "finalized",
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      success: true,
      message: "Allocation complete",
      assignmentCount: allAssignments.length,
      coupleCount,
      singleCount,
    };
  } catch (error) {
    console.error("Allocation error:", error);
    // Preserve typed errors. Re-wrapping them as "internal" hid the actual
    // cause (invalid code, already finalized) from the dashboard.
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", error.message);
  }
});