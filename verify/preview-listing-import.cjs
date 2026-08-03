#!/usr/bin/env node
/**
 * @fileoverview Exercises listing extraction (P0) against the real API.
 *
 * Mirrors verify/preview-results-email.cjs: run it, read the output, decide if
 * the thing is right. Extraction quality is not something a unit test asserts
 * -- the question is whether an organizer would have to correct it, and that
 * needs eyes.
 *
 * The key is a functions secret, so pipe it in rather than exporting it:
 *
 *   ANTHROPIC_API_KEY=$(firebase functions:secrets:access ANTHROPIC_API_KEY) \
 *     node verify/preview-listing-import.cjs
 *
 * Pass a file path to extract from a real PDF or screenshot instead of the
 * built-in sample:
 *
 *   ... node verify/preview-listing-import.cjs ~/Downloads/listing.pdf
 */

const fs = require("fs");
const path = require("path");
const {
  extractListing, isConfigured, MODEL, EFFORT, PRICING,
} = require("../functions/listing-import");

// The combinations worth comparing. Effort matters more than model here:
// thinking bills as output, and on a schema-constrained extraction the
// thinking usually outweighs the JSON. Haiku 4.5 predates adaptive thinking
// and the effort parameter, so it is not in the sweep.
const SWEEP = [
  {model: "claude-opus-5", effort: "high"},
  {model: "claude-opus-5", effort: "low"},
  {model: "claude-sonnet-5", effort: "high"},
  {model: "claude-sonnet-5", effort: "low"},
  {model: "claude-haiku-4-5", effort: "n/a"},
];

/**
 * Dollar cost of one call from its reported usage.
 *
 * @param {string} model Model id.
 * @param {Object} usage The response's usage object.
 * @returns {number} Cost in dollars.
 */
function costOf(model, usage) {
  const p = PRICING[model];
  if (!p || !usage) return NaN;
  const cached = usage.cache_read_input_tokens || 0;
  return ((usage.input_tokens + cached) * p.input +
          usage.output_tokens * p.output) / 1e6;
}

// Deliberately messy: duplicate beds needing distinct names, a bed buried in
// prose, an ambiguous "sleeps" claim that does not match the bed list, and a
// cost split across base + fees. If extraction survives this it survives a
// real listing.
const SAMPLE = `
Sunny Napa Valley Farmhouse — Entire home
$7,200 for 5 nights + $480 cleaning fee + $312 service fee
Sleeps 12 · 4 bedrooms · 3 baths

The space
Our restored 1920s farmhouse sits on two acres of vineyard.

Primary suite (upstairs): king bed, ensuite bath with clawfoot tub,
French doors onto the balcony. The best room in the house, honestly.

Second bedroom (upstairs): two twin beds, shares the hall bath.
Gets morning light.

Third bedroom (downstairs, off the kitchen): queen bed. It's the smallest
room and it does pick up some noise from the kitchen in the morning.

The converted barn loft has a queen bed up a steep ladder — not for anyone
who doesn't love a ladder. There's also a pull-out sofa in the living room
that sleeps two comfortably.

Guest favorite · Superhost · Free parking
`;

const MEDIA = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
};

(async () => {
  if (!isConfigured()) {
    console.error(
        "ANTHROPIC_API_KEY is not set. Pipe it in:\n" +
        "  ANTHROPIC_API_KEY=$(firebase functions:secrets:access " +
        "ANTHROPIC_API_KEY) \\\n    node verify/preview-listing-import.cjs");
    process.exit(1);
  }

  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  let input;
  if (file) {
    const mediaType = MEDIA[path.extname(file).toLowerCase()];
    if (!mediaType) {
      console.error(`Unsupported file type: ${path.extname(file)}`);
      process.exit(1);
    }
    input = {fileData: fs.readFileSync(file).toString("base64"), mediaType};
    console.log(`Reading ${file} (${mediaType})…\n`);
  } else {
    input = {text: SAMPLE};
    console.log("Reading the built-in sample listing…\n");
  }

  // --sweep answers "what should this run on?" with measurements rather than
  // an opinion: same listing, every candidate, cost and quality side by side.
  if (process.argv.includes("--sweep")) {
    console.log("model / effort            in    out    cost   secs  beds  " +
                "caught the sleeps-12 gap?");
    for (const combo of SWEEP) {
      const t0 = Date.now();
      let usage = null;
      try {
        const d = await extractListing(input,
            {...combo, onUsage: (u) => (usage = u.usage)});
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        // The discrepancy catch is the quality signal that separates
        // transcription from reading: the listing claims 12 sleepers and
        // describes 10. A model that silently pads to 12 is worse than useless
        // here, because the organizer would never know to check.
        const caught = /\b(10|12)\b/.test(d.notes) && d.notes.length > 20;
        console.log(
            `${(combo.model + " / " + combo.effort).padEnd(24)} ` +
            `${String(usage.input_tokens).padStart(5)} ` +
            `${String(usage.output_tokens).padStart(6)} ` +
            `$${costOf(combo.model, usage).toFixed(4)} ` +
            `${secs.padStart(6)} ${String(d.rooms.length).padStart(5)}  ` +
            `${caught ? "yes" : "NO"}`);
      } catch (err) {
        console.log(`${(combo.model + " / " + combo.effort).padEnd(24)} ` +
                    `FAILED: ${err.message}`);
      }
    }
    return;
  }

  const started = Date.now();
  let usage = null;
  const draft = await extractListing(input, {onUsage: (u) => (usage = u.usage)});
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`Trip name:  ${draft.name}`);
  console.log(`Total cost: $${draft.totalTripCost.toLocaleString()}`);
  console.log(`Beds:       ${draft.rooms.length}\n`);

  for (const room of draft.rooms) {
    console.log(`  ${room.name}`);
    console.log(`    ${room.type} · sleeps ${room.capacity} · ` +
                `basePrice ${room.basePrice}`);
    if (room.description) console.log(`    ${room.description}`);
  }

  console.log(`\nNotes to organizer: ${draft.notes || "(none)"}`);
  console.log(`\nExtracted in ${elapsed}s on ${MODEL} at effort ${EFFORT}.`);
  if (usage) {
    console.log(`Tokens: ${usage.input_tokens} in / ${usage.output_tokens} ` +
                `out (thinking bills as output) — ` +
                `$${costOf(MODEL, usage).toFixed(4)} for this call.`);
  }

  // The invariant the whole feature rests on: the model never sets a price.
  const priced = draft.rooms.filter((r) => r.basePrice !== 0);
  console.log(priced.length ?
      `FAIL: ${priced.length} bed(s) came back with a nonzero basePrice` :
      "OK: every basePrice is 0 (pricing stays the organizer's call)");
})().catch((err) => {
  console.error("\nExtraction failed:", err.message);
  process.exit(1);
});
