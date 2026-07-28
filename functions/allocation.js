/**
 * Envy-free bed allocation (rent-division model).
 *
 * Port of seed/allocate-envyfree.js (the reference implementation, validated
 * against the January 2026 trip) generalized for production inputs. Replaces
 * the v1 weighted-score + greedy heuristic, which was order-dependent and
 * charged six of eighteen people more than they said their bed was worth.
 *
 *   1. ASSIGNMENT — exact maximum-weight perfect matching (bitmask DP) over
 *      agents x beds. Order-independent: submission order is irrelevant.
 *   2. PRICES — the envy-free price polytope, from difference constraints
 *      solved with max-plus longest paths. Envy-free means no agent prefers
 *      anyone else's (bed, price) pair to their own, judged by that agent's
 *      own reported numbers.
 *   3. SELECTION — maximin (maximize the worst-off agent's surplus) via
 *      binary search, then a uniform shift so per-person adjustments sum to
 *      exactly zero. (Gal, Mash, Procaccia & Zick, EC 2017 — Spliddit's rule.)
 *
 * Generalizations over the CLI prototype, which required #agents == #beds:
 *
 *  - Fewer parties than beds: the market is padded with dummy agents whose
 *    valuation is 0 for every bed. A constant valuation cannot change which
 *    assignment maximizes real welfare, so the matching is unaffected; the
 *    beds dummies receive are the vacant ones. Dummies participate in the
 *    price constraints, which gives vacant beds hypothetical prices high
 *    enough that no real agent envies an empty bed either. Nobody pays a
 *    vacant bed's price and it is not reported.
 *  - More parties than beds, or a couple with no bed that sleeps two, is a
 *    typed failed-precondition error instead of a crash.
 *  - A missing bid (a room added after someone submitted) falls back to the
 *    bed's base price. v1's single path produced NaN here and silently gave
 *    that person the first free bed.
 *
 * Semantics that differ from v1, deliberately:
 *
 *  - A couple is ONE unit-demand agent taking ONE bed of capacity >= 2.
 *    v1 could split a couple across two single beds; bundles reintroduce
 *    complementarities under which envy-free prices can fail to exist at all
 *    (Gul-Stacchetti). See ARCHITECTURE.md.
 *  - Preference rankings are not inputs to the mechanism. The bid vector IS
 *    the valuation, exactly as in the reference implementation. Rankings
 *    remain useful UI scaffolding for building honest bids.
 *
 * The function verifies its own output (zero envy, zero budget) and throws
 * rather than return an allocation that fails the property being sold.
 *
 * Couples (P1.2): a couple forms ONLY on mutual confirmation — submission A
 * names B's email as partnerEmail and B names A's. Anything less (one-sided,
 * dangling, or absent) is two singles. This replaces the old +copy email
 * convention, which let anyone silently glue themselves to another
 * submission by string-parsing addresses.
 */

const {HttpsError} = require("firebase-functions/v2/https");

// 2^MAX_BEDS states in the matching DP: 20 beds -> 1M states, ~8MB, fine.
// A listing with more than 20 beds is outside the product's design range.
const MAX_BEDS = 20;
const EPS = 1e-6;

/**
 * Counts set bits.
 * @param {number} x Non-negative integer.
 * @return {number} Number of set bits.
 */
function popcount(x) {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/**
 * Computes bed assignments and envy-free per-person price adjustments.
 * @param {!Array<!Object>} roomDocs Rooms as {id, name, basePrice, capacity,
 *     type}.
 * @param {!Array<!Object>} submissionDocs Submissions as {email, preferences,
 *     roomPrices}.
 * @return {{assignments: !Array<!Object>, coupleCount: number,
 *     singleCount: number}} Assignments plus the couple/single split, which
 *     the dashboard reports back to the organiser.
 */
function computeAllocation(roomDocs, submissionDocs) {
  if (submissionDocs.length === 0) {
    throw new HttpsError("failed-precondition", "No submissions found");
  }
  if (roomDocs.length === 0) {
    throw new HttpsError("failed-precondition", "No rooms found");
  }
  if (roomDocs.length > MAX_BEDS) {
    throw new HttpsError(
        "failed-precondition",
        `Allocation supports at most ${MAX_BEDS} beds ` +
        `(this trip has ${roomDocs.length}).`);
  }

  const beds = roomDocs.map((r) => ({
    id: r.id,
    name: r.name,
    base: Number(r.basePrice) || 0,
    capacity: Number(r.capacity) || 1,
    bedClass: r.type,
  }));
  const NB = beds.length;

  // ---- Group submissions into unit-demand agents (a couple is one agent) --
  // Mutual confirmation only: A->B and B->A. Emails are unique per trip
  // (submitPreferences rejects duplicates), so pairs are unambiguous — a
  // submission can name at most one partner.
  const byEmail = new Map();
  for (const sub of submissionDocs) {
    byEmail.set(String(sub.email || "").toLowerCase(), sub);
  }
  const memberGroups = [];
  const consumed = new Set();
  for (const sub of submissionDocs) {
    const email = String(sub.email || "").toLowerCase();
    if (consumed.has(email)) continue;
    consumed.add(email);
    const members = [sub];
    const partnerEmail = String(sub.partnerEmail || "").toLowerCase();
    if (partnerEmail && partnerEmail !== email) {
      const partner = byEmail.get(partnerEmail);
      if (partner && !consumed.has(partnerEmail) &&
          String(partner.partnerEmail || "").toLowerCase() === email) {
        members.push(partner);
        consumed.add(partnerEmail);
      }
    }
    memberGroups.push(members);
  }

  const agents = [];
  for (const members of memberGroups) {
    // A couple's valuation is the average of the partners' bids, matching
    // the reference implementation.
    const values = beds.map((bed) => {
      let sum = 0;
      for (const mbr of members) {
        let bid;
        for (const rp of mbr.roomPrices || []) {
          if (rp.id === bed.id) bid = Number(rp.price);
        }
        sum += (bid === undefined || isNaN(bid)) ? bed.base : bid;
      }
      return sum / members.length;
    });
    agents.push({
      emails: members.map((mbr) => mbr.email),
      size: members.length,
      isCouple: members.length === 2,
      values,
    });
  }

  const realCount = agents.length;
  const coupleCount = agents.filter((a) => a.isCouple).length;
  const singleCount = realCount - coupleCount;
  const totalPeople = agents.reduce((s, a) => s + a.size, 0);

  if (realCount > NB) {
    throw new HttpsError(
        "failed-precondition",
        `${realCount} parties have submitted but there are only ${NB} beds.`);
  }

  // ---- Pad to a square market with zero-valuation dummy agents ----
  while (agents.length < NB) {
    agents.push({
      emails: [],
      size: 0,
      isCouple: false,
      values: beds.map(() => 0),
    });
  }
  const NA = agents.length;

  const feasible = (ai, bj) => !agents[ai].isCouple || beds[bj].capacity >= 2;
  const v = agents.map((a) => a.values);

  // ---- 1. Max-weight perfect matching (exact, via bitmask DP) ----
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
      // Unweighted sum of per-person values, exactly as in the reference:
      // envy constraints are per-agent, and only the unweighted optimum
      // guarantees the price constraint system has no positive cycle.
      const val = dp[mask] + v[i][j];
      if (val > dp[next]) {
        dp[next] = val;
        parent[next] = j;
      }
    }
  }

  if (dp[size - 1] === NEG) {
    throw new HttpsError(
        "failed-precondition",
        "No feasible assignment: every couple needs a bed that sleeps two, " +
        "and there are not enough of them.");
  }

  // Reconstruct: agent index -> bed index.
  const assign = new Array(NA);
  let mask = size - 1;
  for (let i = NA - 1; i >= 0; i--) {
    const j = parent[mask];
    assign[i] = j;
    mask ^= 1 << j;
  }
  const owner = new Array(NB);
  assign.forEach((b, a) => (owner[b] = a));

  // ---- 2. Envy-free price polytope ----
  // Agent i on bed a must not envy bed j:
  //   v[i][a] - p[a] >= v[i][j] - p[j]  =>  p[j] - p[a] >= v[i][j] - v[i][a]
  const W = Array.from({length: NB}, () => new Array(NB).fill(NEG));
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
  for (let k = 0; k < NB; k++) {
    for (let a = 0; a < NB; a++) {
      if (LP[a][k] === NEG) continue;
      for (let b = 0; b < NB; b++) {
        if (LP[k][b] === NEG) continue;
        const cand = LP[a][k] + LP[k][b];
        if (cand > LP[a][b]) LP[a][b] = cand;
      }
    }
  }

  for (let a = 0; a < NB; a++) {
    if (LP[a][a] > 1e-9) {
      // Cannot happen if the matching above is welfare-maximal; if it does,
      // the assignment is wrong and no envy-free prices exist for it.
      throw new HttpsError("internal", "Allocation failed self-check: " +
          "positive constraint cycle (assignment not welfare-maximal).");
    }
  }

  // Pointwise-maximal envy-free prices subject to "everyone's surplus >= t".
  const pricesFor = (t) => {
    const bound = beds.map((_, a) => v[owner[a]][a] - t);
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
  };

  // Budget: per-person adjustments must sum to zero across real people.
  // Dummy agents have size 0, so vacant beds never enter the budget.
  const budgetOf = (p) =>
    p.reduce((s, price, a) => s + price * agents[owner[a]].size, 0);

  // ---- 3. Maximin selection: push t as high as the budget allows ----
  const maxAbsV = agents.reduce(
      (m, a) => a.values.reduce((mm, x) => Math.max(mm, Math.abs(x)), m), 0);
  const B = (maxAbsV + 1) * (NB + 2);
  let lo = -B;
  let hi = B;
  for (let it = 0; it < 300; it++) {
    const mid = (lo + hi) / 2;
    if (budgetOf(pricesFor(mid)) >= 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  let p = pricesFor(lo);
  // A uniform shift preserves every difference constraint; use it to land
  // the budget exactly on zero.
  const shift = budgetOf(p) / totalPeople;
  p = p.map((x) => x - shift);

  // ---- Verification (never trust the derivation, check the output) ----
  for (let i = 0; i < NA; i++) {
    const own = v[i][assign[i]] - p[assign[i]];
    for (let j = 0; j < NB; j++) {
      if (!feasible(i, j)) continue;
      if (v[i][j] - p[j] - own > EPS) {
        throw new HttpsError("internal", "Allocation failed self-check: " +
            "envy detected in the computed prices.");
      }
    }
  }
  if (Math.abs(budgetOf(p)) > 0.01) {
    throw new HttpsError("internal", "Allocation failed self-check: " +
        "per-person adjustments do not sum to zero.");
  }

  // ---- Output, in the shape index.js writes to Firestore ----
  const assignments = [];
  for (let i = 0; i < realCount; i++) {
    const b = assign[i];
    assignments.push({
      emails: agents[i].emails,
      beds: beds[b].name,
      bedIds: [beds[b].id],
      bedClass: beds[b].bedClass,
      finalPerPerson: p[b],
    });
  }

  return {assignments, coupleCount, singleCount};
}

module.exports = {computeAllocation};
