/**
 * Democratic Bed Allocation
 * Usage: node allocate-beds.js submissions-export.csv
 */

const fs = require('fs');

if (!process.argv[2]) {
  console.error('❌ CSV filename required');
  process.exit(1);
}

const INPUT = process.argv[2];
const lines = fs.readFileSync(INPUT, 'utf8').trim().split('\n');
const [, ...rows] = lines;

// ---- Authoritative room baselines & similarity groups ----
const ROOMS = {
  bedroom1: { base: 200, group: 'king-private' },
  bedroom2: { base: 150, group: 'king-private' },
  bedroom3: { base: 150, group: 'king-private' },
  bedroom4: { base: 100, group: 'king-private' },

  bedroom5a: { base: -100, group: 'bunk' },
  bedroom5b: { base: -100, group: 'bunk' },
  bedroom5c: { base: -100, group: 'bunk' },
  bedroom5d: { base: -100, group: 'bunk' },
  bedroom5e: { base: -100, group: 'bunk' },
  bedroom5f: { base: -100, group: 'bunk' },

  floor1: { base: -200, group: 'floor' },
  floor2: { base: -200, group: 'floor' }
};

const BEDS = Object.keys(ROOMS);

// ---- CSV parsing (quote-safe) ----
function splitCSV(line) {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
}

function parseRow(line) {
  const cols = splitCSV(line);

  const email = cols[1];

  const preferences = cols[2]
    .replace(/"/g, '')
    .split(' | ')
    .filter(Boolean);

  const roomPrices = cols[3]
    .replace(/"/g, '')
    .split(' | ')
    .reduce((acc, entry) => {
      const [id, price] = entry.split(':');
      acc[id] = Number(price);
      return acc;
    }, {});

  return { email, preferences, roomPrices };
}

const people = rows.map(parseRow);

// ---- Scoring parameters (tunable but defensible) ----
const PREF_WEIGHT = 30;          // ordinal preference strength
const BID_WEIGHT = 1.25;         // willingness-to-pay importance
const GROUP_PROPAGATION = 0.4;   // how much bids affect similar beds

// ---- Utility calculation ----
function utility(person, bed) {
  const { base, group } = ROOMS[bed];
  const bid = person.roomPrices[bed];
  const bidDelta = bid - base;

  const rank = person.preferences.indexOf(bed);
  const effectiveRank =
    rank === -1 ? person.preferences.length : rank;

  const prefScore =
    (person.preferences.length - effectiveRank) * PREF_WEIGHT;

  // Propagate strong preferences to similar beds
  const strongestPref = person.preferences[0];
  const groupBoost =
    ROOMS[strongestPref]?.group === group
      ? Math.max(0, bidDelta) * GROUP_PROPAGATION
      : 0;

  return (
    base +
    bidDelta * BID_WEIGHT +
    prefScore +
    groupBoost
  );
}

// ---- Build score matrix ----
const scores = {};
for (const p of people) {
  scores[p.email] = {};
  for (const bed of BEDS) {
    scores[p.email][bed] = utility(p, bed);
  }
}

// ---- Democratic allocation (max social utility) ----
const assignedBeds = new Set();
const assignedPeople = new Set();
const assignments = [];

while (assignedPeople.size < people.length && assignedBeds.size < BEDS.length) {
  let best = null;

  for (const p of people) {
    if (assignedPeople.has(p.email)) continue;

    for (const bed of BEDS) {
      if (assignedBeds.has(bed)) continue;

      const score = scores[p.email][bed];
      if (!best || score > best.score) {
        best = { person: p.email, bed, score };
      }
    }
  }

  if (!best) break;

  assignedPeople.add(best.person);
  assignedBeds.add(best.bed);
  assignments.push(best);
}

// ---- Output CSV ----
const csv = [
  'email,bed,utilityScore',
  ...assignments.map(a =>
    `${a.person},${a.bed},${a.score.toFixed(2)}`
  )
].join('\n');

fs.writeFileSync('bed-assignments.csv', csv);

// ---- Output Markdown ----
const md = `
# 🛏️ Democratic Bed Assignments

| Person | Bed | Utility |
|-------|-----|---------|
${assignments
  .map(a => `| ${a.person} | ${a.bed} | ${a.score.toFixed(2)} |`)
  .join('\n')}
`;

fs.writeFileSync('bed-assignments.md', md);

console.log('✅ Allocation complete');
console.log('📄 bed-assignments.csv');
console.log('📝 bed-assignments.md');
