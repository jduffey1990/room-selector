#!/usr/bin/env node
/**
 * @fileoverview Renders the results email, and optionally sends one.
 *
 * Rendering is offline and free. `--send <address>` performs a real Brevo
 * call, which is the only way to prove the sender domain is authenticated --
 * a wrong DKIM setup produces a 400 here and a spam folder in production.
 *
 *   node verify/preview-results-email.cjs
 *   BREVO_API_KEY=$(firebase functions:secrets:access BREVO_API_KEY) \
 *     node verify/preview-results-email.cjs --send you@example.com
 */

const {renderResults, resultsUrl, money, isUndeliverable} =
  require("../functions/email.js");

const TRIP_ID = "demoTrip123";
const CODE = "ABCD2345";

const rows = [
  {
    label: "single occupant, above average",
    to: "alex@example.com",
    tripName: "[demo] Napa Cabin",
    beds: ["Primary Suite"],
    totalPerPerson: 612.4,
    sharingWith: null,
  },
  {
    label: "shared bed (couple)",
    to: "sam@example.com",
    tripName: "[demo] Napa Cabin",
    beds: ["Garden Room"],
    totalPerPerson: 431,
    sharingWith: "jo@example.com",
  },
  {
    label: "quoting/apostrophe in trip name",
    to: "kim@example.com",
    tripName: "Kim & Jo's <Big> \"Trip\"",
    beds: ["Bunk A"],
    totalPerPerson: 288.75,
    sharingWith: null,
  },
];

const link = resultsUrl(TRIP_ID, CODE);
let failures = 0;

/**
 * Asserts a condition, recording a failure rather than throwing.
 * @param {boolean} ok Condition to check.
 * @param {string} what Description of the expectation.
 */
function check(ok, what) {
  if (!ok) {
    failures++;
    console.error(`  FAIL: ${what}`);
  } else {
    console.log(`  ok: ${what}`);
  }
}

console.log(`results link: ${link}\n`);
check(link.includes("/#/results/"), "link uses the HashRouter path");
check(link.includes(`?code=${CODE}`), "code rides inside the fragment");
check(money(612.4) === "$612.40", "money() prints exact cents");
check(money(1234.5) === "$1,234.50", "money() groups thousands");

// The [demo] fixtures are entirely example.com; sending to them would hard
// bounce and damage a young sending domain.
check(isUndeliverable("demo-anna@example.com"), "drops @example.com");
check(isUndeliverable("a@foo.test"), "drops .test");
check(isUndeliverable("a@foo.invalid"), "drops .invalid");
check(!isUndeliverable("jo@gmail.com"), "keeps a real address");
check(!isUndeliverable("jo@examples.com"), "keeps lookalike domain");
console.log("");

for (const row of rows) {
  const msg = renderResults({...row, link, participantCode: CODE});
  console.log(`--- ${row.label} -> ${row.to}`);
  console.log(`  subject: ${msg.subject}`);
  console.log(msg.text.split("\n").map((l) => `  | ${l}`).join("\n"));

  const exact = money(row.totalPerPerson);
  check(msg.html.includes(exact), `html states ${exact} literally`);
  check(msg.text.includes(exact), `text states ${exact} literally`);
  check(msg.html.includes(link), "html links to the results page");
  check(msg.text.includes(CODE), "text includes the trip code");
  if (row.sharingWith) {
    check(msg.html.includes(row.sharingWith), "names the other occupant");
    check(/your share/.test(msg.text), "says the figure is a per-person share");
  }
  if (row.tripName.includes("<")) {
    check(!msg.html.includes("<Big>"), "escapes angle brackets in trip name");
  }
  console.log("");
}

const sendIndex = process.argv.indexOf("--send");
if (sendIndex === -1) {
  console.log(failures ? `${failures} check(s) FAILED` : "all checks passed");
  console.log("(dry run -- pass --send <address> to post a real message)");
  process.exit(failures ? 1 : 0);
}

const to = process.argv[sendIndex + 1];
if (!to) {
  console.error("--send needs an address");
  process.exit(1);
}
if (!process.env.BREVO_API_KEY) {
  console.error("BREVO_API_KEY not set; export it before --send");
  process.exit(1);
}

const {sendResultsEmails} = require("../functions/email.js");

sendResultsEmails({
  tripId: TRIP_ID,
  tripName: "[demo] Napa Cabin",
  participantCode: CODE,
  assignments: [{
    emails: [to],
    roomNames: ["Primary Suite"],
    totalPerPerson: 612.4,
  }],
}).then((r) => {
  console.log("send result:", JSON.stringify(r));
  const ok = r.sent === 1 && r.failed === 0;
  console.log(ok ?
    "SENT -- check the inbox, and confirm it is not in spam" :
    "SEND FAILED -- see the error above");
  process.exit(ok && !failures ? 0 : 1);
});
