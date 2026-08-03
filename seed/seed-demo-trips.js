/**
 * Seeds demo trips covering common group-travel shapes, in the current data
 * model (trips store a TOTAL cost; per-person is derived from bed capacity).
 *
 * Every seeded trip is named with a "[demo]" prefix so it can be found and
 * removed later:  node seed-demo-trips.js --clean
 *
 * Usage: node seed-demo-trips.js [--clean]
 */

const admin = require("firebase-admin");
const crypto = require("crypto");
// Same cascade the retention cron and P4 use. Extracted rather than copied:
// a duplicate that forgets the codes/{code} reverse lookup leaves a live
// participant code pointing at a deleted trip.
const {deleteTripCascade} = require("../functions/trip-cascade");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();

const DEMO_PREFIX = "[demo]";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Same generator the createTrip function uses.
 * @param {number} length Characters to generate.
 * @return {string} The code.
 */
function generateCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Bed price adjustments are relative to the per-person share: a master is worth
// paying above the split, a floor spot is worth being paid to take.
const TRIPS = [
  {
    name: `${DEMO_PREFIX} Breckenridge Ski Week`,
    totalTripCost: 9600,
    rooms: [
      {name: "Primary King Suite", description: "Ensuite bath, fireplace, mountain view", basePrice: 220, capacity: 2, type: "king"},
      {name: "King (Upstairs)", description: "Ensuite bath", basePrice: 140, capacity: 2, type: "king"},
      {name: "King (Downstairs)", description: "Hall bath", basePrice: 120, capacity: 2, type: "king"},
      {name: "Queen Room", description: "Shares hall bath", basePrice: 60, capacity: 2, type: "queen"},
      {name: "Bunk Room — Full (Top)", description: "Shared bunk room", basePrice: -110, capacity: 2, type: "bunk"},
      {name: "Bunk Room — Full (Bottom)", description: "Shared bunk room", basePrice: -110, capacity: 2, type: "bunk"},
      {name: "Bunk Room — Twin A", description: "Shared bunk room", basePrice: -130, capacity: 1, type: "twin"},
      {name: "Bunk Room — Twin B", description: "Shared bunk room", basePrice: -130, capacity: 1, type: "twin"},
      {name: "Loft Sleeper Sofa", description: "Open loft, no door", basePrice: -180, capacity: 1, type: "other"},
      {name: "Living Room Floor", description: "Air mattress by the fire", basePrice: -240, capacity: 1, type: "floor"},
    ],
  },
  {
    name: `${DEMO_PREFIX} Outer Banks Beach House`,
    totalTripCost: 6400,
    rooms: [
      {name: "Oceanfront Primary", description: "Balcony, ensuite", basePrice: 260, capacity: 2, type: "king"},
      {name: "Ocean View King", description: "Ensuite bath", basePrice: 150, capacity: 2, type: "king"},
      {name: "Queen — Second Floor", description: "Shares bath", basePrice: 40, capacity: 2, type: "queen"},
      {name: "Twin Room A", description: "Ground floor, shares bath", basePrice: -120, capacity: 1, type: "twin"},
      {name: "Twin Room B", description: "Ground floor, shares bath", basePrice: -120, capacity: 1, type: "twin"},
      {name: "Bunk Nook", description: "Under the stairs", basePrice: -210, capacity: 1, type: "bunk"},
    ],
  },
  {
    name: `${DEMO_PREFIX} Napa Cabin Weekend`,
    totalTripCost: 2400,
    rooms: [
      {name: "Main Bedroom", description: "Ensuite, private deck", basePrice: 180, capacity: 2, type: "king"},
      {name: "Guest Room", description: "Shares hall bath", basePrice: 20, capacity: 2, type: "queen"},
      {name: "Daybed Alcove", description: "Off the kitchen", basePrice: -200, capacity: 1, type: "other"},
    ],
  },
];

/**
 * Deletes every demo trip and its rooms.
 * @return {!Promise<void>}
 */
async function clean() {
  const snap = await db.collection("trips").get();
  const demo = snap.docs.filter((d) => (d.data().name || "").startsWith(DEMO_PREFIX));
  if (demo.length === 0) {
    console.log("No demo trips found.");
    return;
  }
  for (const trip of demo) {
    const counts = await deleteTripCascade(db, trip.ref);
    console.log(`removed ${trip.data().name} (${counts.rooms} rooms, ` +
        `${counts.submissions} submissions, ${counts.assignments} assignments)`);
  }
}

async function seed() {
  for (const spec of TRIPS) {
    const capacity = spec.rooms.reduce((n, r) => n + r.capacity, 0);
    const tripRef = db.collection("trips").doc();

    // Must mirror what createTrip writes, or the admin dashboard and results
    // view have no codes to verify against and return not-found.
    const adminCode = generateCode(10);
    const participantCode = generateCode(8);

    const batch = db.batch();
    batch.set(tripRef, {
      name: spec.name,
      totalTripCost: spec.totalTripCost,
      status: "collecting",
      createdAt: new Date().toISOString(),
    });
    batch.set(tripRef.collection("secret").doc("codes"),
        {adminCode, participantCode});
    batch.set(db.collection("codes").doc(participantCode),
        {tripId: tripRef.id, role: "participant"});
    for (const room of spec.rooms) {
      batch.set(db.collection("rooms").doc(), {tripId: tripRef.id, ...room});
    }
    await batch.commit();

    console.log(
        `${spec.name}\n` +
        `  $${spec.totalTripCost.toLocaleString()} / sleeps ${capacity} across ` +
        `${spec.rooms.length} beds = $${(spec.totalTripCost / capacity).toFixed(2)}/person\n` +
        `  participant code: ${participantCode}   admin code: ${adminCode}\n` +
        `  participant: /#/trip/${tripRef.id}\n` +
        `  admin:       /#/admin/${tripRef.id}?code=${adminCode}\n`);
  }
}

(process.argv.includes("--clean") ? clean() : seed())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
