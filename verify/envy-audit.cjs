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
function audit(roomDocs, submissionDocs, assignments) {
  const bedById = new Map(roomDocs.map((r) => [r.id, r]));
  // Party = base email group; per-person value = average of member bids,
  // defaulting to base.
  const groups = new Map();
  for (const s of submissionDocs) {
    const key = s.email.toLowerCase().replace(/\+[^@]*@/, "@");
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
    const key = a.emails[0].toLowerCase().replace(/\+[^@]*@/, "@");
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
