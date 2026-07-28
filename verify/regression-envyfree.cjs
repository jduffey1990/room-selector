/**
 * Regression: functions/allocation.js must reproduce the reference CLI
 * (seed/allocate-envyfree.js) exactly on the January 2026 submissions.
 *
 * Runs the reference (which writes seed/bed-assignments-envyfree.csv), runs
 * the port on identical inputs, and compares bed + price per email to the
 * cent. Any drift between the two implementations is a failure.
 *
 * Usage: node verify/regression-envyfree.cjs
 */
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const seedDir = path.join(root, "seed");
const {computeAllocation} = require(path.join(root, "functions/allocation.js"));

// The January 2026 bed map, verbatim from the reference implementation.
const BEDS = {
  bedroom1: {base: 200, bedClass: "master", capacity: 2},
  bedroom2: {base: 150, bedClass: "king-ensuite", capacity: 2},
  bedroom3: {base: 150, bedClass: "king-ensuite", capacity: 2},
  bedroom4: {base: 100, bedClass: "king-hall", capacity: 2},
  bedroom5a: {base: -100, bedClass: "full-bunk", capacity: 2},
  bedroom5b: {base: -100, bedClass: "full-bunk", capacity: 2},
  bedroom5c: {base: -100, bedClass: "twin-bunk", capacity: 1},
  bedroom5d: {base: -100, bedClass: "twin-bunk", capacity: 1},
  bedroom5e: {base: -100, bedClass: "twin-bunk", capacity: 1},
  bedroom5f: {base: -100, bedClass: "twin-bunk", capacity: 1},
  floor1: {base: -200, bedClass: "floor", capacity: 1},
  floor2: {base: -200, bedClass: "floor", capacity: 1},
};

// 1. Reference run.
execFileSync("node", ["allocate-envyfree.js", "submissions-export.json"],
    {cwd: seedDir, stdio: ["ignore", "ignore", "inherit"]});
const refRows = fs.readFileSync(
    path.join(seedDir, "bed-assignments-envyfree.csv"), "utf8")
    .trim().split("\n").slice(1)
    .map((l) => {
      const [email, bed, , delta] = l.split(",");
      return {email: email.toLowerCase(), bed, delta: Number(delta)};
    });

// 2. Port run on identical inputs.
const roomDocs = Object.entries(BEDS).map(([id, b]) => ({
  id, name: id, basePrice: b.base, capacity: b.capacity, type: b.bedClass,
}));
const submissionDocs = JSON.parse(fs.readFileSync(
    path.join(seedDir, "submissions-export.json"), "utf8"))
    .map((s) => ({email: s.email, preferences: [], roomPrices: s.roomPrices}));

const {assignments, coupleCount, singleCount} =
    computeAllocation(roomDocs, submissionDocs);

const portByEmail = new Map();
for (const a of assignments) {
  for (const e of a.emails) {
    portByEmail.set(e.toLowerCase(),
        {bed: a.bedIds[0], delta: a.finalPerPerson});
  }
}

// 3. Compare.
let failures = 0;
for (const ref of refRows) {
  const got = portByEmail.get(ref.email);
  if (!got) {
    console.error(`MISSING in port: ${ref.email}`);
    failures++;
    continue;
  }
  const bedOk = got.bed === ref.bed;
  const priceOk = Math.abs(got.delta - ref.delta) < 0.005;
  if (!bedOk || !priceOk) {
    console.error(`MISMATCH ${ref.email}: ` +
        `ref ${ref.bed} $${ref.delta.toFixed(2)} vs ` +
        `port ${got.bed} $${got.delta.toFixed(2)}`);
    failures++;
  }
}
if (portByEmail.size !== refRows.length) {
  console.error(`COUNT: ref ${refRows.length} people, port ${portByEmail.size}`);
  failures++;
}

console.log(`people compared: ${refRows.length}, ` +
    `agents: ${coupleCount} couples + ${singleCount} singles`);
if (failures > 0) {
  console.error(`FAIL: ${failures} discrepancies`);
  process.exit(1);
}
console.log("PASS: port matches the reference implementation exactly.");
