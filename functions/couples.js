/**
 * @fileoverview Who is sharing a bed with whom, derived from what people said.
 *
 * Extracted rather than left inline for the same reason as trip-cascade.js:
 * it is the load-bearing half of P5.2 and the part most worth testing on its
 * own, without a browser, an auth token, or App Check in the way.
 *
 * Takes a `db` rather than initializing its own admin app, so it works under
 * the emulator, in a function, and in a script without caring which.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT: `partnerEmail` on a submission
 * stays the one and only field that allocation (functions/allocation.js) and
 * the envy auditor (verify/envy-audit.cjs) read to decide who is a couple.
 * P5.2 changed how pairing is *expressed* -- names and opaque ids on the wire
 * instead of a typed email address -- and deliberately did not change how it
 * is *stored*. That is why neither of those files needed edits, which matters:
 * the auditor is the code that once manufactured a phantom envy violation by
 * modelling couples its own way.
 */

/** Longest display name accepted, matching the client's input maxLength. */
const MAX_DISPLAY_NAME = 40;

/**
 * Strips a display name to something two people typing the same person would
 * both produce: lowercase, no punctuation, single spaces.
 *
 * @param {string} s Raw name.
 * @return {string} Normalized name.
 */
function normalizeName(s) {
  return String(s || "").toLowerCase()
      .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Whether a typed claim ("Kate") plausibly names a participant ("Kate M.").
 *
 * Deliberately conservative, and asymmetric on purpose: a bare first name
 * matches a longer name starting with it, but two different full names never
 * match each other. This only ever *suggests* a pairing -- an ambiguous match
 * is discarded rather than guessed at, and the leftovers go to the organizer.
 * Being wrong here would put two people in one bed.
 *
 * @param {string} claim The name someone typed for their partner.
 * @param {string} name A participant's own display name.
 * @return {boolean} True if they plausibly refer to the same person.
 */
function nameMatches(claim, name) {
  const a = normalizeName(claim);
  const b = normalizeName(name);
  if (!a || !b) return false;
  if (a === b) return true;
  const at = a.split(" ");
  const bt = b.split(" ");
  // "Kate" matches "Kate M.", but "Kate M." does not match "Kate B.".
  if (at.length === 1 && bt[0] === at[0]) return true;
  if (bt.length === 1 && at[0] === bt[0]) return true;
  return false;
}

/**
 * An address with its middle removed: jduffey@gmail.com -> j*****y@gmail.com.
 *
 * Used only where a display name alone is ambiguous and the alternative is
 * someone picking the wrong person to share a bed with. A deliberate, bounded
 * relaxation of "no client ever sees an email" -- not a general-purpose
 * helper, and not to be reached for anywhere else.
 *
 * @param {string} email The address to mask.
 * @return {string} The masked form.
 */
function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain || !local) return "•••";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}${"•".repeat(Math.max(2, local.length - 2))}${tail}@${domain}`;
}

/**
 * Works out who each submission means, from whichever signal it carries.
 *
 * Two shapes, in priority order:
 *   - `partnerSubmissionId`: they picked a real person from the dropdown.
 *     Exact, and the common case, because whoever submits second can see
 *     whoever submitted first.
 *   - `partnerClaimName`: they typed a name because that person had not
 *     submitted yet. Counts only if it matches exactly one participant.
 *
 * @param {!Array<!Object>} subs Submissions, each with an `id`.
 * @return {!Map<string, string>} Submission id -> intended partner id.
 */
function intendedPartners(subs) {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const intended = new Map();

  for (const s of subs) {
    if (s.partnerSubmissionId && s.partnerSubmissionId !== s.id &&
        byId.has(s.partnerSubmissionId)) {
      intended.set(s.id, s.partnerSubmissionId);
      continue;
    }
    if (s.partnerClaimName) {
      const hits = subs.filter((o) =>
        o.id !== s.id && nameMatches(s.partnerClaimName, o.displayName || ""));
      // Exactly one, or it stays unresolved and the organizer decides. Two
      // people called Kate must not be resolved by coin flip.
      if (hits.length === 1) intended.set(s.id, hits[0].id);
    }
  }
  return intended;
}

/**
 * Classifies every submission on a trip into confirmed pairs and loose ends.
 *
 * Pure, so the dashboard and the resolver agree by construction rather than
 * by two implementations happening to match.
 *
 * @param {!Array<!Object>} subs Submissions, each with an `id`.
 * @return {{pairs: !Array<!Object>, pending: !Array<!Object>}} Confirmed
 *     pairs (each listed once) and unresolved declarations.
 */
function classifyCouples(subs) {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const intended = intendedPartners(subs);
  const pairs = [];
  const pending = [];
  const paired = new Set();

  for (const s of subs) {
    const target = intended.get(s.id);
    const mutual = Boolean(target) && intended.get(target) === s.id;

    if (mutual) {
      if (paired.has(s.id)) continue;
      paired.add(s.id);
      paired.add(target);
      pairs.push({a: s, b: byId.get(target)});
      continue;
    }

    // Declared a partner and it did not come back mutual. Worth surfacing:
    // silently allocating these two as singles is the failure P5.2 exists to
    // end, and the organizer is the only party who can tell what was meant.
    if (s.partnerSubmissionId || s.partnerClaimName) {
      pending.push({
        submission: s,
        claim: s.partnerClaimName || null,
        // Named someone real who has not named them back, vs named someone
        // who has not submitted at all. Different problems, different fixes.
        target: target ? byId.get(target) : null,
        reason: !target ? "no-match" :
          intended.get(target) ? "names-someone-else" : "not-returned",
      });
    }
  }

  return {pairs, pending};
}

/**
 * Recomputes `partnerEmail` for every submission on a trip.
 *
 * Wholesale rather than incremental, so it is idempotent and self-healing: a
 * late submission completes a pairing that was pending, and a removed
 * submission dissolves one, with no separate cleanup path to forget.
 *
 * @param {!Object} db Firestore instance.
 * @param {string} tripId Trip document id.
 * @return {!Promise<number>} How many submissions changed.
 */
async function resolveCouples(db, tripId) {
  const snap = await db.collection("submissions")
      .where("tripId", "==", tripId).get();
  const subs = snap.docs.map((d) => ({id: d.id, ref: d.ref, ...d.data()}));
  const {pairs} = classifyCouples(subs);

  const partnerEmailFor = new Map();
  for (const {a, b} of pairs) {
    partnerEmailFor.set(a.id, b.email || null);
    partnerEmailFor.set(b.id, a.email || null);
  }

  const batch = db.batch();
  let changed = 0;
  for (const s of subs) {
    const want = partnerEmailFor.get(s.id) || null;
    if ((s.partnerEmail || null) !== want) {
      batch.update(s.ref, {partnerEmail: want});
      changed++;
    }
  }
  if (changed) await batch.commit();
  return changed;
}

module.exports = {
  MAX_DISPLAY_NAME,
  normalizeName,
  nameMatches,
  maskEmail,
  intendedPartners,
  classifyCouples,
  resolveCouples,
};
