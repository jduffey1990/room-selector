/**
 * Simulation harness for the envy-free allocator (P2.2).
 *
 * The algorithm had been A/B'd against exactly one real trip. This generates
 * synthetic populations across a scenario grid — group size, couple ratio,
 * bed price spread, preference correlation, bid noise — runs every trip
 * through functions/allocation.js, and measures:
 *
 *   - envy violations, checked INDEPENDENTLY of the allocator's own
 *     self-check (its own verification passing is not evidence);
 *   - welfare per person (sum of each person's value for their bed);
 *   - worst-off surplus (min over parties of value - price);
 *   - price spread across occupied beds;
 *   - budget error (per-person adjustments must sum to zero);
 *   - the v1 heuristic on identical inputs, as the baseline.
 *
 * On trips with <= 9 parties the DP matching is also verified against
 * brute-force enumeration of all feasible assignments.
 *
 * Deterministic: seeded mulberry32 PRNG, so the committed results table is
 * reproducible with `node verify/simulate-envyfree.cjs`.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const {computeAllocation} =
    require(path.join(root, "functions/allocation.js"));

// v1, preserved for baseline comparison: extracted from git history at
// 8ade619^ and inlined here would be noise — instead re-derive it at run time
// from git. Falls back to skipping the baseline if git is unavailable.
const {execFileSync} = require("node:child_process");
let v1compute = null;
try {
  const src = execFileSync("git",
      ["show", "5a90093^:functions/allocation.js"],
      {cwd: root, encoding: "utf8"})
      .replace("const {HttpsError} = require(\"firebase-functions/v2/https\");",
          "class HttpsError extends Error { " +
          "constructor(code, msg) { super(msg); this.code = code; } }");
  const mod = {exports: {}};
  new Function("module", "exports", "require", src)(mod, mod.exports, require);
  v1compute = mod.exports.computeAllocation;
} catch (e) {
  console.error("note: v1 baseline unavailable:", e.message);
}

// ---- Seeded PRNG ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Scenario grid ----
const GRID = {
  people: [4, 6, 9, 12, 16, 18],
  coupleRatio: [0, 0.25, 0.5], // fraction of PEOPLE who are in couples
  spread: [100, 400], // half-range of bed base-price adjustments
  correlation: [0.2, 0.8], // how much bids track common bed quality
  noise: [10, 80], // idiosyncratic bid jitter
};
const SEEDS_PER_CELL = 4;

/**
 * Generates one synthetic trip.
 * @param {!Object} cfg Scenario cell.
 * @param {function(): number} rnd PRNG.
 * @return {{roomDocs: !Array, submissionDocs: !Array}} Allocator inputs.
 */
function generateTrip(cfg, rnd) {
  const couples = Math.floor((cfg.people * cfg.coupleRatio) / 2);
  const singles = cfg.people - couples * 2;
  const parties = couples + singles;
  // Beds: one per party, occasionally 1-2 vacant extras, capped at 20.
  const extra = Math.min(Math.floor(rnd() * 3), 20 - parties);
  const nBeds = parties + extra;
  // Capacity-2 beds: enough for every couple, plus a random share of the
  // rest — singles landing in double rooms is normal.
  const nDouble = Math.min(nBeds,
      couples + Math.floor(rnd() * (nBeds - couples + 1)));

  const roomDocs = [];
  for (let b = 0; b < nBeds; b++) {
    roomDocs.push({
      id: `bed${b}`,
      name: `Bed ${b}`,
      basePrice: Math.round((rnd() * 2 - 1) * cfg.spread),
      capacity: b < nDouble ? 2 : 1,
      type: b < nDouble ? "double" : "single",
    });
  }

  // Each person's raw value for a bed mixes the common signal (its base
  // price) with an idiosyncratic taste, plus jitter. The submitted prices
  // then honour the product's zero-sum rule: deltas from base sum to zero.
  const person = (email) => {
    const deltas = roomDocs.map((r) =>
      cfg.correlation * r.basePrice +
      (1 - cfg.correlation) * (rnd() * 2 - 1) * cfg.spread +
      (rnd() * 2 - 1) * cfg.noise - r.basePrice);
    const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
    const roomPrices = roomDocs.map((r, j) => ({
      id: r.id,
      price: r.basePrice + deltas[j] - mean,
    }));
    const preferences = roomPrices.slice()
        .sort((a, b) => b.price - a.price).map((rp) => rp.id);
    return {email, preferences, roomPrices};
  };

  const submissionDocs = [];
  let n = 0;
  for (let c = 0; c < couples; c++) {
    // Couples carry BOTH markers: mutual partnerEmail (what the production
    // allocator uses, P1.2) and +copy-shaped emails (what the v1 baseline
    // string-parses). The two conventions coincide on this data, so the
    // baseline comparison and the shared audit grouping stay valid.
    const a = person(`p${n}@sim.test`);
    const b = person(`p${n}+copy@sim.test`);
    a.partnerEmail = b.email;
    b.partnerEmail = a.email;
    submissionDocs.push(a);
    submissionDocs.push(b);
    n++;
  }
  for (let s = 0; s < singles; s++) {
    submissionDocs.push(person(`p${n++}@sim.test`));
  }
  return {roomDocs, submissionDocs};
}

// The independent envy check lives in verify/envy-audit.cjs so the
// production lifecycle harness runs the identical implementation.
const {audit} = require("./envy-audit.cjs");

/**
 * Brute-force max-weight feasible assignment for small trips, to verify the
 * DP found the true optimum.
 * @param {!Array} roomDocs Rooms.
 * @param {!Array} submissionDocs Submissions.
 * @return {number} Optimal unweighted per-party welfare.
 */
function bruteForceOptimum(roomDocs, submissionDocs) {
  const groups = new Map();
  for (const s of submissionDocs) {
    const key = s.email.toLowerCase().replace(/\+[^@]*@/, "@");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const agents = [...groups.values()].map((members) => ({
    isCouple: members.length === 2,
    values: roomDocs.map((r) => {
      let sum = 0;
      for (const m of members) {
        const rp = (m.roomPrices || []).find((x) => x.id === r.id);
        sum += rp ? rp.price : r.basePrice;
      }
      return sum / members.length;
    }),
  }));
  let best = -Infinity;
  const used = new Array(roomDocs.length).fill(false);
  const rec = (i, acc) => {
    if (i === agents.length) {
      if (acc > best) best = acc;
      return;
    }
    for (let j = 0; j < roomDocs.length; j++) {
      if (used[j]) continue;
      if (agents[i].isCouple && roomDocs[j].capacity < 2) continue;
      used[j] = true;
      rec(i + 1, acc + agents[i].values[j]);
      used[j] = false;
    }
  };
  rec(0, 0);
  return best;
}

// ---- Run the grid ----
const cells = [];
for (const people of GRID.people) {
  for (const coupleRatio of GRID.coupleRatio) {
    for (const spread of GRID.spread) {
      for (const correlation of GRID.correlation) {
        for (const noise of GRID.noise) {
          cells.push({people, coupleRatio, spread, correlation, noise});
        }
      }
    }
  }
}

let trips = 0;
let efEnvyTotal = 0;
let dpMismatches = 0;
let maxBudgetError = 0;
const rows = [];
const t0 = Date.now();

for (const cfg of cells) {
  const agg = {
    efEnvy: 0, v1Envy: 0, v1Trips: 0,
    efWelfare: 0, v1Welfare: 0,
    efWorst: 0, v1Worst: 0,
    efSpread: 0,
    negSurplusPeopleV1: 0,
  };
  for (let seed = 0; seed < SEEDS_PER_CELL; seed++) {
    const rnd = mulberry32(
        cells.indexOf(cfg) * 7919 + seed * 104729 + 1);
    const {roomDocs, submissionDocs} = generateTrip(cfg, rnd);
    const res = computeAllocation(roomDocs, submissionDocs);
    const m = audit(roomDocs, submissionDocs, res.assignments);
    trips++;
    efEnvyTotal += m.envyPairs;
    maxBudgetError = Math.max(maxBudgetError, m.budgetError);
    agg.efEnvy += m.envyPairs;
    agg.efWelfare += m.welfarePerPerson;
    agg.efWorst += m.worstSurplus;
    agg.efSpread += m.priceSpread;

    if (m.parties <= 9) {
      const opt = bruteForceOptimum(roomDocs, submissionDocs);
      // Recompute the DP's achieved unweighted welfare from the audit
      // placement to compare against the enumerated optimum.
      const groups = new Map();
      for (const s of submissionDocs) {
        const key = s.email.toLowerCase().replace(/\+[^@]*@/, "@");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      const bedById = new Map(roomDocs.map((r) => [r.id, r]));
      let achieved = 0;
      for (const a of res.assignments) {
        const key = a.emails[0].toLowerCase().replace(/\+[^@]*@/, "@");
        const members = groups.get(key);
        let sum = 0;
        for (const mem of members) {
          const rp = (mem.roomPrices || []).find(
              (x) => x.id === a.bedIds[0]);
          sum += rp ? rp.price : bedById.get(a.bedIds[0]).basePrice;
        }
        achieved += sum / members.length;
      }
      if (Math.abs(achieved - opt) > 1e-6) dpMismatches++;
    }

    if (v1compute) {
      try {
        const v1res = v1compute(roomDocs, submissionDocs);
        const v1m = audit(roomDocs, submissionDocs, v1res.assignments);
        agg.v1Trips++;
        agg.v1Envy += v1m.envyPairs;
        agg.v1Welfare += v1m.welfarePerPerson;
        agg.v1Worst += v1m.worstSurplus;
        if (v1m.worstSurplus < -0.005) agg.negSurplusPeopleV1++;
      } catch (e) {
        // v1 crashes on some inputs (that is part of the story).
      }
    }
  }
  rows.push({cfg, agg});
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);

// ---- Report ----
const fmt = (x) => (Math.round(x * 100) / 100).toFixed(2);
let md = `# Envy-free allocator — simulation results (P2.2)

Generated by \`node verify/simulate-envyfree.cjs\` (deterministic, seeded).

- **Trips simulated: ${trips}** (${cells.length} scenario cells x ` +
`${SEEDS_PER_CELL} seeds), ${secs}s
- **Envy violations (envy-free allocator): ${efEnvyTotal}** — checked by an
  independent auditor, not the allocator's own self-check
- Max budget error (|sum of per-person adjustments|): ` +
`$${maxBudgetError.toExponential(2)}
- DP matching vs brute-force enumeration on trips with <= 9 parties: ` +
`${dpMismatches} mismatches
- v1 baseline runs on identical inputs (v1 = the weighted-score heuristic
  this replaces)

Columns are means over the cell's seeds. "v1 envy" counts party-pairs where
one party strictly prefers another's (bed, price); "worst surplus" is the
worst-off party's value-minus-price (negative = someone charged more than
they said their bed was worth).

| people | couple% | spread | corr | noise | EF envy | v1 envy | EF worst | v1 worst | EF welf/pp | v1 welf/pp | EF spread |
|---|---|---|---|---|---|---|---|---|---|---|---|
`;
for (const {cfg, agg} of rows) {
  const n = SEEDS_PER_CELL;
  const nv = agg.v1Trips || 1;
  md += `| ${cfg.people} | ${cfg.coupleRatio * 100} | ${cfg.spread} | ` +
      `${cfg.correlation} | ${cfg.noise} | ${agg.efEnvy} | ` +
      `${v1compute ? fmt(agg.v1Envy / nv) : "-"} | ` +
      `${fmt(agg.efWorst / n)} | ` +
      `${v1compute ? fmt(agg.v1Worst / nv) : "-"} | ` +
      `${fmt(agg.efWelfare / n)} | ` +
      `${v1compute ? fmt(agg.v1Welfare / nv) : "-"} | ` +
      `${fmt(agg.efSpread / n)} |\n`;
}

const totalV1Envy = rows.reduce((s, r) => s + r.agg.v1Envy, 0);
const totalV1Trips = rows.reduce((s, r) => s + r.agg.v1Trips, 0);
const negCells = rows.reduce((s, r) => s + r.agg.negSurplusPeopleV1, 0);
md += `
## Summary

- Envy-free allocator: **${efEnvyTotal} envy violations in ${trips} trips**.
- v1 heuristic on the same trips: ${totalV1Envy} envy violations across ` +
`${totalV1Trips} runs, and in ${negCells} runs it charged at least one ` +
`party more than their own stated value for their bed.
`;

fs.writeFileSync(path.join(__dirname, "simulation-results.md"), md);
console.log(md.split("\n").slice(0, 12).join("\n"));
console.log(`...\nwrote verify/simulation-results.md`);
if (efEnvyTotal > 0 || dpMismatches > 0) {
  console.error("FAIL: envy or DP mismatch detected");
  process.exit(1);
}
console.log("PASS: zero envy across all trips; DP matches brute force.");
