/**
 * @fileoverview Transactional email via Brevo's HTTP API.
 *
 * Scope is deliberately narrow: one message, sent to people who are already
 * in a trip. Nothing here writes to Brevo's contact database — participants
 * are other people's friends who clicked a link, and copying them into a
 * marketing platform would break the retention promise the privacy policy
 * makes. Transactional send only, no lists, no templates.
 *
 * The hard rule from CLAUDE.md: email failure must never fail an allocation.
 * Every export here resolves; none of them throw.
 */

const SENDER_EMAIL =
  process.env.RESULTS_SENDER_EMAIL || "noreply@roomselector5000.com";
const SENDER_NAME = "Selecta-bot";
const SITE_ORIGIN =
  process.env.PUBLIC_SITE_ORIGIN || "https://www.roomselector5000.com";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// A hung API must not hold a function instance open until the platform kills
// it -- allocation has already committed by the time we get here.
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Formats a number as a literal dollar figure.
 *
 * Voice rule: money is stated plainly and exactly. "$612.40" is the whole
 * job -- no rounding to something friendlier, no robot flourish.
 * @param {number} n Amount in dollars.
 * @return {string} e.g. "$1,234.50".
 */
function money(n) {
  const value = Number(n) || 0;
  return "$" + value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Escapes text for interpolation into the HTML body.
 * @param {string} s Untrusted text (trip name, bed name).
 * @return {string} HTML-safe text.
 */
function escapeHtml(s) {
  return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
}

/**
 * Builds the results link for a trip.
 *
 * The client uses HashRouter, so the path and its query string both live
 * inside the fragment. Getting this wrong produces a link that loads the app
 * but drops the code, which reads to a participant as "the link is broken".
 * @param {string} tripId Trip document id.
 * @param {string} participantCode Code that unlocks results.
 * @return {string} Absolute URL.
 */
function resultsUrl(tripId, participantCode) {
  return `${SITE_ORIGIN}/#/results/${tripId}?code=${participantCode}`;
}

/**
 * Renders one participant's results email.
 * @param {!Object} row Recipient's assignment details.
 * @param {string} row.tripName Trip name.
 * @param {!Array<string>} row.beds Bed name(s) assigned.
 * @param {number} row.totalPerPerson What this person pays.
 * @param {?string} row.sharingWith Partner's email, when sharing a bed.
 * @param {string} row.link Results URL.
 * @param {string} row.participantCode Trip code.
 * @return {{subject: string, html: string, text: string}} Message parts.
 */
function renderResults(row) {
  const bedList = row.beds.join(" + ");
  const subject = `Your bed for ${row.tripName}: ${bedList}`;

  // Retro flourish is allowed in the heading and nowhere near the number.
  const sharing = row.sharingWith ?
    `<p style="margin:0 0 16px;">You are sharing this bed with ` +
      `${escapeHtml(row.sharingWith)}. The figure above is your share, ` +
      `not the pair's total.</p>` :
    "";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#faf6ef;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,
  Arial,sans-serif;color:#1f2933;line-height:1.5;">
  <div style="max-width:520px;margin:0 auto;background:#fffdf8;
    border:2px solid rgba(31,41,51,0.1);border-radius:16px;padding:28px;">
    <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;
      text-transform:uppercase;color:#5b6b7a;">Selecta-bot reports</p>
    <h1 style="margin:0 0 20px;font-size:24px;">
      ${escapeHtml(row.tripName)}</h1>

    <p style="margin:0 0 8px;">Your bed:</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:700;">
      ${escapeHtml(bedList)}</p>

    <p style="margin:0 0 8px;">You pay:</p>
    <p style="margin:0 0 20px;font-size:28px;font-weight:700;">
      ${money(row.totalPerPerson)}</p>

    ${sharing}

    <p style="margin:0 0 20px;">Everyone was offered every bed at its
      price, and this is the assignment where nobody prefers someone
      else's bed at what they are paying for it.</p>

    <p style="margin:0 0 24px;">
      <a href="${row.link}" style="display:inline-block;background:#1f6f78;
        color:#ffffff;text-decoration:none;padding:12px 20px;
        border-radius:8px;font-weight:600;">See the full results</a></p>

    <p style="margin:0 0 4px;font-size:14px;color:#5b6b7a;">
      Trip code: <strong>${escapeHtml(row.participantCode)}</strong></p>
    <p style="margin:0;font-size:14px;color:#5b6b7a;">
      If the button does not work, open:<br>
      <a href="${row.link}" style="color:#1f6f78;">${escapeHtml(row.link)}</a>
    </p>
  </div>
</body>
</html>`;

  const text = [
    `${row.tripName}`,
    "",
    `Your bed: ${bedList}`,
    `You pay: ${money(row.totalPerPerson)}`,
    row.sharingWith ?
      `You are sharing this bed with ${row.sharingWith}. The figure ` +
        "above is your share, not the pair's total." :
      null,
    "",
    "Everyone was offered every bed at its price, and this is the " +
      "assignment where nobody prefers someone else's bed at what they " +
      "are paying for it.",
    "",
    `Full results: ${row.link}`,
    `Trip code: ${row.participantCode}`,
  ].filter((line) => line !== null).join("\n");

  return {subject, html, text};
}

/**
 * Posts one message to Brevo.
 * @param {string} apiKey Brevo API key.
 * @param {string} to Recipient address.
 * @param {{subject: string, html: string, text: string}} msg Message parts.
 * @return {!Promise<void>} Resolves on success, rejects with a plain Error.
 */
async function postToBrevo(apiKey, to, msg) {
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({
      sender: {email: SENDER_EMAIL, name: SENDER_NAME},
      to: [{email: to}],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Brevo returns a JSON body with a code/message worth surfacing; a bad
    // sender or unverified domain shows up here and nowhere else.
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// Reserved documentation/test domains (RFC 2606, RFC 6761). The [demo]
// fixtures and the e2e harness are full of these, and every one of them hard
// bounces. Bounces are what wreck a young sending domain's reputation, so
// they are dropped before they reach Brevo rather than being "sent".
const UNDELIVERABLE = /@(example\.(com|net|org)|.*\.(test|invalid|localhost))$/;

/**
 * True for addresses that provably cannot receive mail.
 * @param {string} email Address to check.
 * @return {boolean} Whether the address is a reserved test address.
 */
function isUndeliverable(email) {
  return UNDELIVERABLE.test(String(email || "").toLowerCase().trim());
}

/**
 * Emails every participant their own assignment.
 *
 * Never throws and never rejects: allocation has already committed when this
 * runs, so a mail problem is a reporting problem, not an allocation problem.
 * A missing API key is a normal, logged, non-error outcome (CLAUDE.md P1.2).
 * @param {!Object} params Send parameters.
 * @param {string} params.tripId Trip document id.
 * @param {string} params.tripName Trip name, for the subject line.
 * @param {string} params.participantCode Code that unlocks results.
 * @param {!Array<!Object>} params.assignments Committed assignments, each
 *     with `emails`, `roomNames` and `totalPerPerson`.
 * @return {!Promise<{sent: number, failed: number, skipped: boolean}>}
 *     Outcome summary, safe to return to the caller.
 */
async function sendResultsEmails(params) {
  const {tripId, tripName, participantCode, assignments} = params;
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log("[email] BREVO_API_KEY absent -- skipping results email");
    return {sent: 0, failed: 0, skipped: true};
  }

  const link = resultsUrl(tripId, participantCode);
  const rows = [];
  for (const a of assignments) {
    const emails = Array.isArray(a.emails) ? a.emails : [];
    for (const email of emails) {
      rows.push({
        to: email,
        tripName,
        beds: Array.isArray(a.roomNames) ? a.roomNames : [],
        totalPerPerson: a.totalPerPerson,
        // Only meaningful for a shared bed; names the other occupant so the
        // per-person figure cannot be misread as the pair's total.
        sharingWith: emails.length > 1 ?
          emails.filter((e) => e !== email).join(", ") : null,
        link,
        participantCode,
      });
    }
  }

  const deliverable = rows.filter((r) => !isUndeliverable(r.to));
  const dropped = rows.length - deliverable.length;
  if (dropped > 0) {
    console.log(`[email] dropped ${dropped} reserved test address(es)`);
  }

  const results = await Promise.allSettled(deliverable.map((row) =>
    postToBrevo(apiKey, row.to, renderResults(row))));

  const failures = results.filter((r) => r.status === "rejected");
  for (const f of failures) {
    console.error("[email] send failed:", f.reason && f.reason.message);
  }
  console.log(
      `[email] results: ${results.length - failures.length} sent, ` +
      `${failures.length} failed, trip ${tripId}`);

  return {
    sent: results.length - failures.length,
    failed: failures.length,
    dropped,
    skipped: false,
  };
}

module.exports = {
  sendResultsEmails, renderResults, resultsUrl, money, isUndeliverable,
};
