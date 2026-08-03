/**
 * @fileoverview Listing import (P0) — turn a rental listing into a draft trip.
 *
 * The organizer uploads or pastes a listing; Claude extracts rooms, beds and
 * cost; the create form is pre-filled. Nothing here writes to Firestore. The
 * organizer reviews and edits, then submits through the normal `createTrip`
 * path — extraction is a suggestion, never a commitment. That separation is
 * deliberate: this is the only place in the product where a machine guesses at
 * numbers a person will later pay, so a human sits between the guess and the
 * record.
 *
 * Paste/upload, not scrape. Fetching listing URLs violates Airbnb's ToS and
 * gets Cloud Function IPs blocked.
 */

const Anthropic = require("@anthropic-ai/sdk");

// Measured 2026-08-03 with verify/preview-listing-import.cjs --sweep, on the
// messy sample listing in that harness. All five candidates found the same 6
// beds and all flagged the listing's "sleeps 12" vs 10 described:
//
//   opus-5 / high     $0.0261    opus-5 / low      $0.0200
//   sonnet-5 / high   $0.0082    sonnet-5 / low    $0.0081
//   haiku-4-5         $0.0026
//
// Haiku is 10x cheaper than Opus and read *better* on this sample -- it kept
// "not suitable for those uncomfortable with ladders" where Sonnet trimmed to
// "accessed via steep ladder", and the ladder caveat is exactly the kind of
// thing that changes how someone ranks a bed.
//
// A weak extraction is cheap here by design: the organizer reviews every field
// before anything is created, and the notes panel surfaces what the model was
// unsure about. That is what makes the cheapest model the right default rather
// than a gamble.
//
// CAVEAT: measured on one clean text sample. Not yet tested on a real
// multi-page PDF or a screenshot, where a smaller model has more room to
// degrade. Re-run the sweep against a real listing before trusting it there;
// if it slips, this is a one-constant change to claude-sonnet-5.
const MODEL = "claude-haiku-4-5";
const EFFORT = "low";

// Measured 2026-08-03: Sonnet 5 returns 400 for the `fallbacks` parameter.
const SUPPORTS_FALLBACKS = ["claude-opus-5", "claude-fable-5"];

// Pre-4.6 generation: no adaptive thinking, no effort parameter.
const LEGACY_MODELS = ["claude-haiku-4-5"];

// Published $/1M tokens, for the harness's cost report only. Nothing reads
// these at runtime.
const PRICING = {
  "claude-opus-5": {input: 5, output: 25},
  // Introductory pricing through 2026-08-31; reverts to $3/$15.
  "claude-sonnet-5": {input: 2, output: 10},
  "claude-haiku-4-5": {input: 1, output: 5},
};

// Mirrors the <option> values in TripCreator.jsx. The model must choose from
// this set or the pre-filled <select> silently falls back to the first option
// and the organizer sees a bed type nobody suggested.
const BED_TYPES = ["king", "queen", "full", "twin", "bunk", "floor", "other"];

// Matches createTrip's own ceiling — extracting 60 rooms only to have the
// submit rejected would waste the organizer's review pass.
const MAX_ROOMS = 50;

// Callable payloads cap out around 10MB. Staying well under keeps the failure
// a clear message here rather than an opaque transport error.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TEXT_CHARS = 120000;

const SUPPORTED_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * The shape the create form needs. Enforced server-side by the API rather than
 * parsed hopefully on our end: `output_config.format` guarantees the response
 * validates, so there is no JSON-repair path feeding a money form.
 *
 * Every object needs `additionalProperties: false` and a complete `required`
 * list; numeric/length constraints are not supported and are checked below.
 */
const LISTING_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description:
        "A short name for the trip, e.g. \"Napa House\". Use the property " +
        "name if the listing has one, otherwise the location.",
    },
    totalTripCost: {
      type: "number",
      description:
        "Total cost of the whole stay in dollars, including cleaning and " +
        "service fees if they are stated. 0 if the listing does not say.",
    },
    rooms: {
      type: "array",
      description:
        "One entry per sleeping spot a person could be assigned. A room " +
        "with two queen beds is two entries, not one.",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "How a guest would refer to it, e.g. \"Primary bedroom\" or " +
              "\"Loft twin (left)\". Distinguish duplicates.",
          },
          description: {
            type: "string",
            description:
              "Anything that would change how much someone wants it: " +
              "ensuite, view, stairs, no window, shared with another bed. " +
              "Empty string if the listing says nothing.",
          },
          basePrice: {
            type: "number",
            description:
              "Always 0. Pricing is the organizer's decision, not the " +
              "listing's.",
          },
          capacity: {
            type: "integer",
            description: "How many people sleep in this bed. Usually 1 or 2.",
          },
          type: {type: "string", enum: BED_TYPES},
        },
        required: ["name", "description", "basePrice", "capacity", "type"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "string",
      description:
        "What you could not determine or had to guess, in one or two plain " +
        "sentences addressed to the organizer. Empty string if the listing " +
        "was unambiguous. Do not pad this.",
    },
  },
  required: ["name", "totalTripCost", "rooms", "notes"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You extract sleeping arrangements from short-term rental listings so an organizer can divide beds among a group.

Read the listing and return one entry per **individual sleeping spot** — the unit a single person or couple gets assigned. A bedroom containing a queen and a twin is two entries. A sofa bed someone will actually sleep on is an entry. Do not merge, and do not invent spots the listing does not mention.

Rules that matter:
- Never guess a price for an individual bed. Always set basePrice to 0. The organizer sets prices, and a number you invented would look authoritative and be wrong.
- totalTripCost is the only dollar figure you fill in, and only if the listing states it. Use 0 rather than estimating.
- If the listing is vague about a bed ("sleeps 8"), extract what is actually described and say what you could not determine in notes. Do not pad the list to reach a headcount.
- Descriptions should carry what would make someone prefer or avoid that bed. Skip marketing copy.

You are producing a draft the organizer will review and correct. Being accurate and incomplete is better than being complete and invented.`;

/**
 * Whether listing import is available in this deployment.
 *
 * The key is the owner's to create. Absent, the feature is simply off and the
 * create form stays fully usable by hand — extraction must never be load-
 * bearing for making a trip.
 *
 * @returns {boolean} True if an API key is configured.
 */
function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Validates and normalizes what the model returned.
 *
 * The schema guarantees the response parses and has the right field types; it
 * cannot guarantee the values are sane. Clamp rather than reject: a slightly
 * odd draft the organizer can fix beats an error that makes them retype
 * everything.
 *
 * @param {Object} draft Parsed model output.
 * @returns {Object} A draft safe to pre-fill the form with.
 */
function normalizeDraft(draft) {
  const rooms = (Array.isArray(draft.rooms) ? draft.rooms : [])
      .slice(0, MAX_ROOMS)
      .map((room) => ({
        name: String(room.name || "").trim().slice(0, 120),
        description: String(room.description || "").slice(0, 300),
        // The prompt says always 0, but a model is not a guarantee. Pricing
        // stays the organizer's decision even if extraction disagrees.
        basePrice: 0,
        capacity: Math.min(20, Math.max(1, parseInt(room.capacity, 10) || 1)),
        type: BED_TYPES.includes(room.type) ? room.type : "other",
      }))
      .filter((room) => room.name);

  const cost = Number(draft.totalTripCost);

  return {
    name: String(draft.name || "").trim().slice(0, 120),
    totalTripCost: Number.isFinite(cost) && cost > 0 ? Math.round(cost) : 0,
    rooms,
    notes: String(draft.notes || "").slice(0, 600),
  };
}

/**
 * Builds the user content block for whichever input the organizer gave us.
 *
 * @param {Object} input `{text}` or `{fileData, mediaType}`.
 * @returns {Array<Object>} Anthropic content blocks.
 */
function buildContent({text, fileData, mediaType}) {
  const instruction = {
    type: "text",
    text: "Extract the sleeping arrangements from this listing.",
  };

  if (fileData) {
    // PDFs ride in a document block, images in an image block; the block type
    // must match the media type or the API rejects it.
    const isPdf = mediaType === "application/pdf";
    return [
      {
        type: isPdf ? "document" : "image",
        source: {type: "base64", media_type: mediaType, data: fileData},
      },
      instruction,
    ];
  }

  return [
    {type: "text", text: `<listing>\n${text}\n</listing>`},
    instruction,
  ];
}

/**
 * Extracts a draft trip from listing text or an uploaded document.
 *
 * @param {Object} input `{text}` or `{fileData, mediaType}` (base64, no prefix).
 * @returns {Promise<Object>} `{name, totalTripCost, rooms, notes}`.
 * @throws {Error} With a message safe to show the organizer.
 */
async function extractListing(input, options = {}) {
  const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
  const {model = MODEL, effort = EFFORT, onUsage} = options;

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    // Thinking tokens bill as output, and on a schema-constrained extraction
    // they are the dominant cost. Effort is the lever -- see MODEL above.
    // Haiku 4.5 predates adaptive thinking and the effort parameter and 400s
    // on both, so it gets neither. Kept as a branch rather than deleted: it is
    // the cheapest option and the reason we are not using it is measured
    // quality, not incompatibility.
    ...(LEGACY_MODELS.includes(model) ? {} : {thinking: {type: "adaptive"}}),
    // Server-side refusal fallback is Opus-5-only -- Sonnet 5 rejects the
    // parameter with a 400 (measured 2026-08-03). Spread it in conditionally
    // rather than pinning the model to it: a rental listing should never trip
    // a safety classifier, so this is insurance, not a requirement.
    ...(SUPPORTS_FALLBACKS.includes(model) ? {
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } : {}),
    system: SYSTEM_PROMPT,
    output_config: {
      ...(LEGACY_MODELS.includes(model) ? {} : {effort}),
      format: {type: "json_schema", schema: LISTING_SCHEMA},
    },
    messages: [{role: "user", content: buildContent(input)}],
  });

  if (onUsage) onUsage({model, effort, usage: response.usage});

  // stop_reason is checked before content is read: on a refusal `content` is
  // empty or partial, and indexing it blindly throws something unhelpful.
  if (response.stop_reason === "refusal") {
    throw new Error(
        "Could not read that listing. Enter the beds by hand instead.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(
        "That listing is too long to read in one pass. Try uploading just " +
        "the pages describing the bedrooms.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block) {
    throw new Error(
        "Could not read that listing. Enter the beds by hand instead.");
  }

  return normalizeDraft(JSON.parse(block.text));
}

module.exports = {
  extractListing,
  isConfigured,
  normalizeDraft,
  MODEL,
  EFFORT,
  PRICING,
  BED_TYPES,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  SUPPORTED_MEDIA_TYPES,
};
