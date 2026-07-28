/**
 * Envy-Free Bed Allocation (rent-division model)
 *
 * Replaces the weighted-score + greedy approach with the standard
 * rent-division mechanism:
 *
 *   1. ASSIGNMENT  — maximum-weight perfect matching over agents x beds.
 *                    Exact (bitmask DP), so it is order-independent: who
 *                    submitted first has no effect on who gets what.
 *
 *   2. PRICES      — the unique-up-to-selection family of ENVY-FREE prices.
 *                    Envy-free means: no agent prefers anyone else's
 *                    (bed, price) pair to their own, judged by that agent's
 *                    own reported numbers. So "I was outbid" becomes
 *                    "I was offered it at that price and I declined."
 *
 *   3. SELECTION   — among all envy-free price vectors, pick the MAXIMIN one
 *                    (maximize the worst-off agent's surplus).
 *
 * Theory: an envy-free solution always exists (Svensson 1983;
 * Alkan-Demange-Gale 1991), and every envy-free assignment is automatically
 * welfare-maximizing. Maximin selection follows Gal, Mash, Procaccia & Zick
 * (EC 2017), which is what Spliddit's rent-division tool uses.
 *
 * Agents are unit-demand: a couple is ONE agent that takes ONE bed. That is
 * what keeps the problem inside the tractable theory -- letting couples take
 * bundles (two singles) reintroduces complementarities, under which envy-free
 * prices can fail to exist entirely.
 *
 * Usage: node allocate-envyfree.js submissions-full18.csv
 *        node allocate-envyfree.js submissions-export.json
 */

const fs = require('fs');

const INPUT = process.argv[2];
if (!INPUT) {
  console.error('Usage: node allocate-envyfree.js <submissions.csv|.json>');
  process.exit(1);
}

// ---- Bed definitions (per-person adjustment relative to the base cost) ----
const BEDS = {
  bedroom1: { base: 200, bedClass: 'master', capacity: 2 },
  bedroom2: { base: 150, bedClass: 'king-ensuite', capacity: 2 },
  bedroom3: { base: 150, bedClass: 'king-ensuite', capacity: 2 },
  bedroom4: { base: 100, bedClass: 'king-hall', capacity: 2 },
  bedroom5a: { base: -100, bedClass: 'full-bunk', capacity: 2 },
  bedroom5b: { base: -100, bedClass: 'full-bunk', capacity: 2 },
  bedroom5c: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5d: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5e: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5f: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  floor1: { base: -200, bedClass: 'floor', capacity: 1 },
  floor2: { base: -200, bedClass: 'floor', capacity: 1 },
};
const BED_IDS = Object.keys(BEDS);
const NB = BED_IDS.length;

// ---- Input ----
function loadPeople(path) {
  if (path.endsWith('.json')) {
    return JSON.parse(fs.readFileSync(path, 'utf8')).map((x) => ({
      email: x.email,
      bids: x.roomPrices.reduce((a, r) => ((a[r.id] = r.price), a), {}),
    }));
  }
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
  const [, ...rows] = lines;
  const splitCSV = (l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  return rows.map((l) => {
    const c = splitCSV(l);
    return {
      email: c[1],
      bids: c[3]
        .replace(/"/g, '')
        .split(' | ')
        .reduce((a, e) => {
          const [id, p] = e.split(':');
          a[id] = Number(p);
          return a;
        }, {}),
    };
  });
}

const people = loadPeople(INPUT);

// ---- Group into unit-demand agents (a couple is one agent) ----
const groups = new Map();
for (const p of people) {
  const m = p.email.toLowerCase().match(/^([^+@]+)(?:\+[^@]+)?(@.+)$/);
  const key = m ? m[1] + m[2] : p.email.toLowerCase();
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}

const agents = [];
for (const [key, members] of groups) {
  // A couple's valuation is the average of the partners' bids, matching the
  // convention the original script used.
  const bids = {};
  for (const bed of BED_IDS) {
    const vals = members.map((m) =>
      m.bids[bed] === undefined ? BEDS[bed].base : m.bids[bed]
    );
    bids[bed] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  agents.push({
    key,
    emails: members.map((m) => m.email),
    size: members.length,
    isCouple: members.length === 2,
    bids,
  });
}

const NA = agents.length;
const totalPeople = agents.reduce((s, a) => s + a.size, 0);

console.log(`\nAgents: ${NA} (${agents.filter((a) => a.isCouple).length} couples, ` +
  `${agents.filter((a) => !a.isCouple).length} singles) = ${totalPeople} people`);
console.log(`Beds:   ${NB} (capacity ${BED_IDS.reduce((s, b) => s + BEDS[b].capacity, 0)})`);

if (NA !== NB) {
  console.error(`\nThis prototype expects #agents == #beds (got ${NA} vs ${NB}).`);
  console.error('Pad with dummy beds or merge beds to run other configurations.');
  process.exit(1);
}

// ---- Feasibility: a couple needs a bed that sleeps 2 ----
const feasible = (ai, bj) =>
  !agents[ai].isCouple || BEDS[BED_IDS[bj]].capacity >= 2;

// v[agent][bed] = per-person value
const v = agents.map((a) => BED_IDS.map((b) => a.bids[b]));

// ---- 1. Max-weight perfect matching (exact, via bitmask DP) ----
// Maximizing the UNWEIGHTED sum of per-person values is exactly what
// envy-freeness forces (the p-terms cancel over any permutation).
const NEG = -Infinity;
const size = 1 << NB;
const dp = new Float64Array(size).fill(NEG);
const parent = new Int32Array(size).fill(-1);
dp[0] = 0;

for (let mask = 0; mask < size; mask++) {
  if (dp[mask] === NEG) continue;
  const i = popcount(mask);
  if (i >= NA) continue;
  for (let j = 0; j < NB; j++) {
    if (mask & (1 << j)) continue;
    if (!feasible(i, j)) continue;
    const next = mask | (1 << j);
    const val = dp[mask] + v[i][j];
    if (val > dp[next]) {
      dp[next] = val;
      parent[next] = j;
    }
  }
}

function popcount(x) {
  let c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

if (dp[size - 1] === NEG) {
  console.error('\nNo feasible perfect matching exists.');
  process.exit(1);
}

// Reconstruct assignment: agent index -> bed index
const assign = new Array(NA);
let mask = size - 1;
for (let i = NA - 1; i >= 0; i--) {
  const j = parent[mask];
  assign[i] = j;
  mask ^= 1 << j;
}
const owner = new Array(NB); // bed index -> agent index
assign.forEach((b, a) => (owner[b] = a));

// ---- 2. Envy-free price polytope ----
// Agent i on bed a must not envy bed j:
//     v[i][a] - p[a] >= v[i][j] - p[j]
//  => p[j] - p[a] >= v[i][j] - v[i][a]
// A system of difference constraints; solvable iff no positive cycle.
const W = Array.from({ length: NB }, () => new Array(NB).fill(NEG));
for (let a = 0; a < NB; a++) {
  const i = owner[a];
  W[a][a] = 0;
  for (let j = 0; j < NB; j++) {
    if (j === a || !feasible(i, j)) continue;
    W[a][j] = v[i][j] - v[i][a];
  }
}

// Longest paths (max-plus Floyd-Warshall) chain the constraints together.
const LP = W.map((r) => r.slice());
for (let k = 0; k < NB; k++)
  for (let a = 0; a < NB; a++) {
    if (LP[a][k] === NEG) continue;
    for (let b = 0; b < NB; b++) {
      if (LP[k][b] === NEG) continue;
      const cand = LP[a][k] + LP[k][b];
      if (cand > LP[a][b]) LP[a][b] = cand;
    }
  }

for (let a = 0; a < NB; a++) {
  if (LP[a][a] > 1e-9) {
    console.error(`\nPositive cycle at ${BED_IDS[a]} - assignment is not welfare-maximal.`);
    process.exit(1);
  }
}

// Pointwise-maximal envy-free prices subject to "everyone's surplus >= t".
function pricesFor(t) {
  const bound = BED_IDS.map((_, a) => v[owner[a]][a] - t);
  const p = new Array(NB);
  for (let a = 0; a < NB; a++) {
    let best = Infinity;
    for (let b = 0; b < NB; b++) {
      if (LP[a][b] === NEG) continue;
      const cand = bound[b] - LP[a][b];
      if (cand < best) best = cand;
    }
    p[a] = best;
  }
  return p;
}

// Budget: per-person adjustments must sum to zero across all people.
const budgetOf = (p) =>
  p.reduce((s, price, a) => s + price * agents[owner[a]].size, 0);

// ---- 3. Maximin selection: push t as high as the budget allows ----
let lo = -5000;
let hi = 5000;
for (let it = 0; it < 300; it++) {
  const mid = (lo + hi) / 2;
  if (budgetOf(pricesFor(mid)) >= 0) lo = mid;
  else hi = mid;
}
const tStar = lo;
let p = pricesFor(tStar);
// Uniform shift preserves every difference constraint; use it to land the
// budget exactly on zero.
const shift = budgetOf(p) / totalPeople;
p = p.map((x) => x - shift);

// ---- Verification (never trust the derivation, check the output) ----
let maxEnvy = 0;
let envyCount = 0;
for (let i = 0; i < NA; i++) {
  const own = v[i][assign[i]] - p[assign[i]];
  for (let j = 0; j < NB; j++) {
    if (!feasible(i, j)) continue;
    const alt = v[i][j] - p[j];
    if (alt - own > 1e-6) { envyCount++; maxEnvy = Math.max(maxEnvy, alt - own); }
  }
}
const budget = budgetOf(p);
const welfare = assign.reduce((s, b, i) => s + v[i][b] * agents[i].size, 0);

console.log('\n=== VERIFICATION ===');
console.log(`Envy violations : ${envyCount} (max $${maxEnvy.toFixed(6)})`);
console.log(`Budget (sum of per-person adjustments): $${budget.toFixed(6)}`);
console.log(`Min surplus (maximin t*): $${tStar.toFixed(2)}`);

// ---- Report ----
const rows = [];
console.log('\n=== ASSIGNMENT & ENVY-FREE PRICES ===\n');
const order = assign
  .map((b, i) => ({ i, b }))
  .sort((x, y) => p[y.b] - p[x.b]);

for (const { i, b } of order) {
  const a = agents[i];
  const surplus = v[i][b] - p[b];
  console.log(
    `${BED_IDS[b].padEnd(10)} ${BEDS[BED_IDS[b]].bedClass.padEnd(14)} ` +
    `$${p[b].toFixed(2).padStart(8)}/person  ` +
    `bid $${v[i][b].toFixed(0).padStart(5)}  surplus $${surplus.toFixed(2).padStart(7)}  ` +
    `${a.emails.join(' + ')}`
  );
  for (const e of a.emails) {
    rows.push({ email: e, bed: BED_IDS[b], bedClass: BEDS[BED_IDS[b]].bedClass, delta: p[b], surplus });
  }
}

console.log(`\nWelfare (sum of per-person values of assigned beds): $${welfare.toFixed(2)}`);

fs.writeFileSync(
  'bed-assignments-envyfree.csv',
  'email,bed,bedClass,delta,surplus\n' +
    rows.map((r) => `${r.email},${r.bed},${r.bedClass},${r.delta.toFixed(2)},${r.surplus.toFixed(2)}`).join('\n')
);
console.log('\nWrote bed-assignments-envyfree.csv');
