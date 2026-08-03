/**
 * The independent envy check, shared by every harness that needs one.
 *
 * Extracted from verify/simulate-envyfree.cjs so the production lifecycle
 * harness (verify/p4-lifecycle.mjs) checks re-allocation with exactly the same
 * code that produced the committed 576-trip simulation result, rather than a
 * second implementation that could agree with the allocator by sharing its
 * bug. The whole value of this function is that it does NOT consult the
 * allocator's own self-check: it rebuilds unit-demand agents from raw rooms
 * and submissions and re-derives who envies whom.
 *
 * Prices here are per-person ADJUSTMENTS relative to the base share, which is
 * the unit the allocator, the room `basePrice` field and the submitted
 * `roomPrices[].price` all use. Callers reading Firestore assignment docs pass
 * `priceAdjustment` as `finalPerPerson` and `roomIds` as `bedIds`.
 */

/**
 * Rebuilds unit-demand agents from raw inputs, independently of the
 * allocator's internal grouping, and measures envy/welfare/surplus for a
 * result in the allocator's output shape.
 * @param {!Array} roomDocs Rooms.
 * @param {!Array} submissionDocs Submissions.
 * @param {!Array} assignments Allocator output.
 * @return {!Object} Metrics.
 */
/**
 * Maps each submitter's email to the key of the party they belong to.
 *
 * A party is one person, or two who named each other. Mutual confirmation is
 * the rule the product enforces, so a one-sided `partnerEmail` is deliberately
 * NOT a couple here -- reading it as one would let this auditor disagree with
 * the allocator about who the agents even are.
 *
 * Base-email normalization is kept alongside it because the simulation's
 * fixtures pair `pN@sim.test` with `pN+copy@sim.test`. That was once the whole
 * grouping rule, and it is why this function exists: real couples use two
 * different addresses, so normalization alone silently split them, scored the
 * pair from one member's bids, and invented envy that the allocator had not
 * created. Worse, which member survived depended on `assignment.emails[0]`,
 * which is unordered -- so the same allocation audited clean or dirty run to
 * run.
 *
 * @param {!Array} submissionDocs Submissions.
 * @returns {!Map<string, string>} lowercased email -> party key.
 */
function partyKeys(submissionDocs) {
  const norm = (e) => e.toLowerCase().replace(/\+[^@]*@/, "@");
  const byEmail = new Map(submissionDocs.map((s) => [s.email.toLowerCase(), s]));
  const keys = new Map();
  for (const s of submissionDocs) {
    const me = s.email.toLowerCase();
    const partner = (s.partnerEmail || "").toLowerCase();
    const other = partner ? byEmail.get(partner) : null;
    const mutual = other && (other.partnerEmail || "").toLowerCase() === me;
    // Sorted, so both members derive the identical key from either side.
    keys.set(me, mutual ? [norm(me), norm(partner)].sort().join("|") : norm(me));
  }
  return keys;
}

function audit(roomDocs, submissionDocs, assignments) {
  const bedById = new Map(roomDocs.map((r) => [r.id, r]));
  // Party = one person, or two who confirmed each other; per-person value =
  // average of member bids, defaulting to base.
  const keys = partyKeys(submissionDocs);
  const groups = new Map();
  for (const s of submissionDocs) {
    const key = keys.get(s.email.toLowerCase());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const valueOf = (members, bedId) => {
    const bed = bedById.get(bedId);
    let sum = 0;
    for (const m of members) {
      const rp = (m.roomPrices || []).find((x) => x.id === bedId);
      sum += rp ? rp.price : bed.basePrice;
    }
    return sum / members.length;
  };

  // Where did each party land, and at what price?
  const placed = new Map(); // groupKey -> {bedId, price}
  for (const a of assignments) {
    // Resolved through the same party map, so a couple lands under one key
    // whichever member happens to be first in the assignment's email list.
    const first = a.emails[0].toLowerCase();
    const key = keys.get(first) || first.replace(/\+[^@]*@/, "@");
    placed.set(key, {bedId: a.bedIds[0], price: a.finalPerPerson,
      size: a.emails.length});
  }

  let envyPairs = 0;
  let maxEnvy = 0;
  let welfare = 0;
  let people = 0;
  let worst = Infinity;
  let budget = 0;
  const prices = [];
  for (const [key, mine] of placed.entries()) {
    const members = groups.get(key);
    const own = valueOf(members, mine.bedId) - mine.price;
    welfare += valueOf(members, mine.bedId) * mine.size;
    people += mine.size;
    budget += mine.price * mine.size;
    prices.push(mine.price);
    if (own < worst) worst = own;
    for (const [, theirs] of placed.entries()) {
      if (theirs === mine) continue;
      if (mine.size === 2 && bedById.get(theirs.bedId).capacity < 2) continue;
      const alt = valueOf(members, theirs.bedId) - theirs.price;
      if (alt - own > 1e-6) {
        envyPairs++;
        maxEnvy = Math.max(maxEnvy, alt - own);
      }
    }
  }
  return {
    envyPairs, maxEnvy,
    welfarePerPerson: welfare / people,
    worstSurplus: worst,
    priceSpread: Math.max(...prices) - Math.min(...prices),
    budgetError: Math.abs(budget),
    parties: placed.size,
  };
}

module.exports = {audit};
