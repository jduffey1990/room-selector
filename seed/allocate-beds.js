/**
 * Democratic Bed Allocation - Final Fixed Version
 * 
 * Utility scores: Used for allocation (includes preferences + bids + baseline)
 * Prices: Used for billing (submitted room prices, normalized + zero-sum)
 * 
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

// ---- Room definitions ----
const ROOMS = {
  bedroom1: { base: 200, bedClass: 'master', capacity: 2 },
  bedroom2: { base: 150, bedClass: 'king-ensuite', capacity: 2 },
  bedroom3: { base: 150, bedClass: 'king-ensuite', capacity: 2 },
  bedroom4: { base: 100, bedClass: 'king-hall', capacity: 2 },
  bedroom5a: { base: -100, bedClass: 'full-bunk', capacity: 2 },
  bedroom5b: { base: -100, bedClass: 'full-bunk', capacity: 2 },
  bedroom5c: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5d: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5e: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  bedroom5f: { base: -100, bedClass: 'twin-bunk', capacity: 1 },
  floor1: { base: -200, bedClass: 'floor', capacity: 1 },
  floor2: { base: -200, bedClass: 'floor', capacity: 1 }
};

const BEDS = Object.keys(ROOMS);
const DOUBLE_BEDS = BEDS.filter(id => ROOMS[id].capacity === 2);
const SINGLE_BEDS = BEDS.filter(id => ROOMS[id].capacity === 1);

// ---- CSV parsing ----
function splitCSV(line) {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
}

function parseRow(line) {
  const cols = splitCSV(line);
  const email = cols[1];
  const preferences = cols[2]
    ? cols[2].replace(/"/g, '').split(' | ').filter(Boolean)
    : [];
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

// ---- Couple detection ----
console.log('\n👥 Detecting couples...\n');

const coupleMap = new Map();

for (const person of people) {
  const match = person.email.match(/^([^+@]+)(?:\+[^@]+)?(@.+)$/);
  const baseEmail = match ? match[1] + match[2] : person.email;
  
  if (!coupleMap.has(baseEmail)) {
    coupleMap.set(baseEmail, []);
  }
  coupleMap.get(baseEmail).push(person);
}

const couples = [];
const singles = [];

for (const [baseEmail, members] of coupleMap.entries()) {
  if (members.length === 2) {
    const primary = members.find(m => !m.email.includes('+copy')) || members[0];
    const secondary = members.find(m => m.email.includes('+copy')) || members[1];
    
    // Average their bids
    const avgRoomPrices = {};
    for (const bed of BEDS) {
      const price1 = primary.roomPrices[bed] || ROOMS[bed].base;
      const price2 = secondary.roomPrices[bed] || ROOMS[bed].base;
      avgRoomPrices[bed] = (price1 + price2) / 2;
    }
    
    couples.push({
      id: baseEmail,
      primary: primary.email,
      secondary: secondary.email,
      preferences: primary.preferences,
      roomPrices: avgRoomPrices
    });
    
    console.log(`  Couple: ${primary.email} + ${secondary.email}`);
  } else if (members.length === 1) {
    singles.push(members[0]);
    console.log(`  Solo: ${members[0].email}`);
  }
}

console.log(`\n  Total: ${couples.length} couples, ${singles.length} singles\n`);

// ---- Scoring parameters (for allocation only) ----
const BASELINE_WEIGHT = 2.0;
const BID_WEIGHT = 0.8;
const PREF_WEIGHT = 25;
const SIMILAR_PROPAGATION = 0.3;

// ---- Utility calculation (for allocation) ----
function utility(person, bed) {
  const { base, bedClass } = ROOMS[bed];
  const bid = person.roomPrices[bed];
  const bidDelta = bid - base;

  let rank = person.preferences.indexOf(bed);
  if (rank === -1) {
    rank = person.preferences.length;
  }

  const maxRank = Math.max(person.preferences.length, BEDS.length);
  const prefScore = (maxRank - rank) * PREF_WEIGHT;

  let similarityBoost = 0;
  if (person.preferences.length > 0) {
    const topChoice = person.preferences[0];
    const topBed = ROOMS[topChoice];
    
    if (topBed && topBed.bedClass === bedClass) {
      const topBidDelta = person.roomPrices[topChoice] - topBed.base;
      similarityBoost = Math.max(0, topBidDelta) * SIMILAR_PROPAGATION;
    }
  }

  return (
    base * BASELINE_WEIGHT +
    bidDelta * BID_WEIGHT +
    prefScore +
    similarityBoost
  );
}

// ---- Allocate couples ----
console.log('💑 Allocating couples (by utility)...\n');

const usedBeds = new Set();
const coupleAssignments = [];

for (const couple of couples) {
  let bestOption = null;
  
  // Option 1: capacity-2 beds
  for (const bed of DOUBLE_BEDS) {
    if (usedBeds.has(bed)) continue;
    
    const score = utility(couple, bed);
    if (!bestOption || score > bestOption.score) {
      bestOption = {
        type: 'double',
        beds: [bed],
        score: score
      };
    }
  }
  
  // Option 2: two single beds
  const singleBedsByClass = {};
  for (const bed of SINGLE_BEDS) {
    if (usedBeds.has(bed)) continue;
    const bedClass = ROOMS[bed].bedClass;
    if (!singleBedsByClass[bedClass]) {
      singleBedsByClass[bedClass] = [];
    }
    singleBedsByClass[bedClass].push(bed);
  }
  
  for (const [bedClass, availableBeds] of Object.entries(singleBedsByClass)) {
    if (availableBeds.length >= 2) {
      const bed1 = availableBeds[0];
      const bed2 = availableBeds[1];
      
      const score1 = utility(couple, bed1);
      const score2 = utility(couple, bed2);
      const avgScore = (score1 + score2) / 2;
      
      if (!bestOption || avgScore > bestOption.score) {
        bestOption = {
          type: 'double-single',
          beds: [bed1, bed2],
          score: avgScore
        };
      }
    }
  }
  
  if (!bestOption) {
    console.log(`  ⚠️  ${couple.primary} + partner → NO BEDS AVAILABLE`);
    continue;
  }
  
  for (const bed of bestOption.beds) {
    usedBeds.add(bed);
  }
  
  coupleAssignments.push({
    couple: couple,
    beds: bestOption.beds,
    type: bestOption.type
  });
  
  if (bestOption.type === 'double') {
    console.log(`  ${couple.primary} + partner → ${bestOption.beds[0]} (together)`);
  } else {
    console.log(`  ${couple.primary} → ${bestOption.beds[0]}`);
    console.log(`  ${couple.secondary} → ${bestOption.beds[1]} (couple, separate beds)`);
  }
}

// ---- Allocate singles ----
console.log('\n🧍 Allocating singles (by utility)...\n');

const singleAssignments = [];

for (const single of singles) {
  let bestBed = null;
  let bestScore = null;
  
  for (const bed of BEDS) {
    if (usedBeds.has(bed)) continue;
    
    const score = utility(single, bed);
    if (bestScore === null || score > bestScore) {
      bestBed = bed;
      bestScore = score;
    }
  }
  
  if (!bestBed) {
    console.log(`  ⚠️  ${single.email} → NO BEDS AVAILABLE`);
    continue;
  }
  
  usedBeds.add(bestBed);
  singleAssignments.push({
    single: single,
    bed: bestBed
  });
  
  console.log(`  ${single.email} → ${bestBed}`);
}

// ---- Build assignment list with ACTUAL PRICES ----
console.log('\n💰 Calculating prices (separate from utility)...\n');

const allAssignments = [];

for (const ca of coupleAssignments) {
  const couple = ca.couple;
  const bedClass = ROOMS[ca.beds[0]].bedClass;
  
  if (ca.type === 'double') {
    // Both in one bed - use their averaged bid for that bed
    const price = couple.roomPrices[ca.beds[0]];
    
    allAssignments.push({
      emails: [couple.primary, couple.secondary],
      beds: ca.beds[0],
      bedClass: bedClass,
      submittedPrice: price,
      count: 2
    });
  } else {
    // Each in separate bed - use their averaged bids
    allAssignments.push({
      emails: [couple.primary],
      beds: ca.beds[0],
      bedClass: bedClass,
      submittedPrice: couple.roomPrices[ca.beds[0]],
      count: 1
    });
    allAssignments.push({
      emails: [couple.secondary],
      beds: ca.beds[1],
      bedClass: bedClass,
      submittedPrice: couple.roomPrices[ca.beds[1]],
      count: 1
    });
  }
}

for (const sa of singleAssignments) {
  const bedClass = ROOMS[sa.bed].bedClass;
  const price = sa.single.roomPrices[sa.bed];
  
  allAssignments.push({
    emails: [sa.single.email],
    beds: sa.bed,
    bedClass: bedClass,
    submittedPrice: price,
    count: 1
  });
}

// ---- Normalize prices within bed classes ----
const classPrices = {};
for (const a of allAssignments) {
  if (!classPrices[a.bedClass]) {
    classPrices[a.bedClass] = { totalPrice: 0, totalPeople: 0 };
  }
  classPrices[a.bedClass].totalPrice += a.submittedPrice * a.count;
  classPrices[a.bedClass].totalPeople += a.count;
}

const classAverages = {};
for (const [bedClass, data] of Object.entries(classPrices)) {
  classAverages[bedClass] = data.totalPrice / data.totalPeople;
  console.log(`  ${bedClass}: ${data.totalPeople} people, avg delta: $${classAverages[bedClass].toFixed(2)}`);
}

for (const a of allAssignments) {
  a.normalizedPerPerson = classAverages[a.bedClass];
}

// ---- Zero-sum adjustment ----
const totalPeople = allAssignments.reduce((sum, a) => sum + a.count, 0);
let currentSum = allAssignments.reduce((sum, a) => sum + (a.normalizedPerPerson * a.count), 0);

console.log(`\n⚖️  Sum of deltas: $${currentSum.toFixed(2)}`);
console.log(`   Applying zero-sum adjustment...\n`);

const perPersonAdjustment = -currentSum / totalPeople;
console.log(`   Adjustment per person: $${perPersonAdjustment.toFixed(2)}`);

for (const a of allAssignments) {
  a.finalPerPerson = a.normalizedPerPerson + perPersonAdjustment;
}

const finalSum = allAssignments.reduce((sum, a) => sum + (a.finalPerPerson * a.count), 0);
console.log(`   Final sum: $${finalSum.toFixed(2)} ✓\n`);

// ---- Track unassigned ----
const assignedEmails = new Set();
for (const a of allAssignments) {
  for (const email of a.emails) {
    assignedEmails.add(email);
  }
}

const unassignedPeople = people.filter(p => !assignedEmails.has(p.email));

if (unassignedPeople.length > 0) {
  console.log(`⚠️  ${unassignedPeople.length} people could not be assigned (no capacity):`);
  for (const p of unassignedPeople) {
    console.log(`  ${p.email}`);
  }
  console.log('');
}

// ---- Output CSV ----
const csvRows = ['email,bed,bedClass,delta,totalCost'];

for (const a of allAssignments) {
  for (const email of a.emails) {
    const totalCost = 480 + a.finalPerPerson;
    csvRows.push(`${email},${a.beds},${a.bedClass},${a.finalPerPerson.toFixed(2)},${totalCost.toFixed(2)}`);
  }
}

fs.writeFileSync('bed-assignments.csv', csvRows.join('\n'));

// ---- Output Markdown ----
const couplesTogetherInOne = coupleAssignments.filter(ca => ca.type === 'double');
const couplesOnSeparateBeds = coupleAssignments.filter(ca => ca.type === 'double-single');

const md = `
# 🛏️ Democratic Bed Assignments

**Base cost: $480/person** (already paid)

Prices below are **DELTAS** (adjustments):
- Positive (+) = owe extra
- Negative (-) = get refund

## Final Assignments

| Person(s) | Bed(s) | Bed Class | Delta | Total |
|-----------|--------|-----------|-------|-------|
${allAssignments
  .map(a => {
    const people = a.count === 2 
      ? `${a.emails[0]} + partner`
      : a.emails[0];
    const delta = a.finalPerPerson >= 0 ? `+$${a.finalPerPerson.toFixed(2)}` : `$${a.finalPerPerson.toFixed(2)}`;
    const total = (480 + a.finalPerPerson).toFixed(2);
    return `| ${people} | ${a.beds} | ${a.bedClass} | ${delta} | $${total} |`;
  })
  .join('\n')}

## Price Summary by Bed Class

| Bed Class | People | Delta/Person | Total/Person |
|-----------|--------|--------------|--------------|
${Object.entries(classAverages)
  .map(([bedClass, avg]) => {
    const count = classPrices[bedClass].totalPeople;
    const finalDelta = avg + perPersonAdjustment;
    const deltaStr = finalDelta >= 0 ? `+$${finalDelta.toFixed(2)}` : `$${finalDelta.toFixed(2)}`;
    const total = (480 + finalDelta).toFixed(2);
    return `| ${bedClass} | ${count} | ${deltaStr} | $${total} |`;
  })
  .join('\n')}

## Verification

✓ Sum of deltas: $${finalSum.toFixed(2)}
✓ All beds in same class have identical prices
✓ Couples stay together (never mixed with others)

## Details

**Couples sharing one bed:** ${couplesTogetherInOne.length}
${couplesTogetherInOne.map(ca => `- ${ca.couple.primary} + partner → ${ca.beds[0]}`).join('\n') || '_None_'}

**Couples on separate beds (same type):** ${couplesOnSeparateBeds.length}
${couplesOnSeparateBeds.map(ca => 
  `- ${ca.couple.primary} → ${ca.beds[0]}\n- ${ca.couple.secondary} → ${ca.beds[1]}`
).join('\n') || '_None_'}

**Singles:** ${singles.length}
${singleAssignments.map(sa => `- ${sa.single.email} → ${sa.bed}`).join('\n') || '_None_'}
`;

fs.writeFileSync('bed-assignments.md', md);

console.log('✅ Files created:');
console.log('   bed-assignments.csv');
console.log('   bed-assignments.md\n');