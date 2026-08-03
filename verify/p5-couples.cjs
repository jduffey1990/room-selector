/**
 * P5.2 — partner pairing, tested where the logic lives.
 *
 * The pure half needs nothing: no browser, no auth token, no App Check. The
 * resolver half runs against the Firestore emulator.
 *
 * Why this exists rather than trusting the browser harness: pairing decides
 * who sleeps in the same bed, and every way it can go wrong is silent. A
 * dropped pairing allocates two people as singles; a wrong pairing puts two
 * people who did not agree into one bed. Neither throws, and the browser
 * cannot see either -- by the time a pairing is visible in results it is
 * already too late to tell whether it was what anyone meant.
 *
 *   node verify/p5-couples.cjs                       # pure checks only
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     node verify/p5-couples.cjs                     # + resolver checks
 */
const {
  nameMatches, maskEmail, classifyCouples, resolveCouples,
} = require("../functions/couples");

let failures = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "ok" : "FAIL"}: ${what}`);
  if (!ok) failures++;
};

// --- name matching -------------------------------------------------------
console.log("\n=== name matching");
const nameCases = [
  ["Kate", "Kate", true, "exact"],
  ["kate", "  KATE  ", true, "case and padding ignored"],
  ["Kate", "Kate M.", true, "a first name matches a fuller name"],
  ["Kate M.", "Kate", true, "and the same in reverse"],
  ["Kate M.", "Kate B.", false, "two different full names never match"],
  ["Kate", "Katherine", false, "no prefix guessing — Kate is not Katherine"],
  ["Kate", "Nate", false, "one letter apart is still a different person"],
  ["", "Kate", false, "an empty claim matches nobody"],
  ["Kate", "", false, "and nobody matches an empty name"],
  ["Jordan D", "jordan d.", true, "punctuation ignored on both sides"],
];
for (const [claim, name, want, why] of nameCases) {
  check(nameMatches(claim, name) === want, `${why} ("${claim}" vs "${name}")`);
}

// --- masking -------------------------------------------------------------
console.log("\n=== address masking");
check(maskEmail("jduffey@gmail.com") === "j•••••y@gmail.com", "middle removed, domain kept");
check(maskEmail("ab@x.com").startsWith("a"), "very short local parts do not crash");
check(maskEmail("") === "•••", "a missing address masks to nothing readable");
check(!maskEmail("jduffey@gmail.com").includes("duffe"), "the local part is not recoverable");

// --- classification ------------------------------------------------------
console.log("\n=== classifying declarations");
const sub = (id, displayName, email, extra = {}) =>
  ({id, displayName, email, partnerSubmissionId: null, partnerClaimName: null, ...extra});

// Both picked each other from the dropdown.
let r = classifyCouples([
  sub("a", "Jordan", "j@x.com", {partnerSubmissionId: "b"}),
  sub("b", "Kate", "k@x.com", {partnerSubmissionId: "a"}),
]);
check(r.pairs.length === 1 && r.pending.length === 0, "mutual dropdown picks form one pair");
check(r.pairs.length === 1, "a pair is listed once, not twice");

// The ordering case this whole design exists for: Jordan submits first and
// can only type a name; Kate submits later and picks him exactly.
r = classifyCouples([
  sub("a", "Jordan", "j@x.com", {partnerClaimName: "Kate"}),
  sub("b", "Kate M.", "k@x.com", {partnerSubmissionId: "a"}),
]);
check(r.pairs.length === 1, "a typed claim plus a later exact pick resolves");

// Two Kates: refusing to guess is the whole point.
r = classifyCouples([
  sub("a", "Jordan", "j@x.com", {partnerClaimName: "Kate"}),
  sub("b", "Kate", "k1@x.com", {partnerClaimName: "Jordan"}),
  sub("c", "Kate", "k2@x.com"),
]);
check(r.pairs.length === 0, "an ambiguous name resolves to nobody rather than a coin flip");
check(r.pending.some((p) => p.submission.id === "a"), "the ambiguous claim is surfaced, not dropped");

// Named someone who has not submitted at all.
r = classifyCouples([sub("a", "Jordan", "j@x.com", {partnerClaimName: "Nobody"})]);
check(r.pairs.length === 0 && r.pending.length === 1, "a claim on a non-submitter stays pending");
check(r.pending[0].reason === "no-match", "and is reported as having no match");

// One-sided: Jordan names Kate, Kate names someone else.
r = classifyCouples([
  sub("a", "Jordan", "j@x.com", {partnerSubmissionId: "b"}),
  sub("b", "Kate", "k@x.com", {partnerSubmissionId: "c"}),
  sub("c", "Sam", "s@x.com"),
]);
check(r.pairs.length === 0, "a one-sided declaration is not a couple");
check(
  r.pending.find((p) => p.submission.id === "a").reason === "names-someone-else",
  "and says the named person named a third party"
);

// Nobody declared anything.
r = classifyCouples([sub("a", "Jordan", "j@x.com"), sub("b", "Kate", "k@x.com")]);
check(r.pairs.length === 0 && r.pending.length === 0,
  "submissions with no declaration produce no pairs and no noise");

// Self-reference must never pair.
r = classifyCouples([sub("a", "Jordan", "j@x.com", {partnerSubmissionId: "a"})]);
check(r.pairs.length === 0, "a submission cannot pair with itself");

// --- the resolver, against real documents --------------------------------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("\n(skipping resolver checks — set FIRESTORE_EMULATOR_HOST to run them)");
} else {
  const admin = require("firebase-admin");
  admin.initializeApp({projectId: "room-selector"});
  const db = admin.firestore();
  const TRIP = "[demo] p5-couples-fixture";

  (async () => {
    console.log("\n=== resolver (emulator)");
    const existing = await db.collection("submissions")
        .where("tripId", "==", TRIP).get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));

    const jordan = await db.collection("submissions").add({
      tripId: TRIP, email: "jordan@x.com", displayName: "Jordan",
      partnerSubmissionId: null, partnerClaimName: "Kate", partnerEmail: null,
    });

    // Jordan alone: he named someone who has not submitted, so no pairing.
    await resolveCouples(db, TRIP);
    let j = (await jordan.get()).data();
    check(j.partnerEmail === null, "a pending claim leaves partnerEmail null");

    // Kate arrives and picks Jordan exactly.
    const kate = await db.collection("submissions").add({
      tripId: TRIP, email: "kate@x.com", displayName: "Kate",
      partnerSubmissionId: jordan.id, partnerClaimName: null, partnerEmail: null,
    });
    await resolveCouples(db, TRIP);
    j = (await jordan.get()).data();
    let k = (await kate.get()).data();
    check(
      j.partnerEmail === "kate@x.com" && k.partnerEmail === "jordan@x.com",
      "a later submission completes the pairing on BOTH sides"
    );

    // Idempotence: running again must not thrash the documents.
    const changed = await resolveCouples(db, TRIP);
    check(changed === 0, "re-running changes nothing (idempotent)");

    // Removing one dissolves the other side, rather than stranding it.
    await kate.delete();
    await resolveCouples(db, TRIP);
    j = (await jordan.get()).data();
    check(j.partnerEmail === null, "removing a partner dissolves the survivor's pairing");

    await jordan.delete();
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
    process.exit(failures ? 1 : 0);
  })();
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
