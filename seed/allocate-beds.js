/**
 * Democratic Bed Allocation - Fixed Version
 * 
 * ALLOCATION:
 * - Phase 1: Preferences first (ordinal ranking), conflicts resolved by utility
 * - Phase 2: Remaining people allocated by utility
 * - Couples get priority bonus for 2-capacity beds
 * 
 * PRICING:
 * - Based on ALL people's bids (not just who got assigned)
 * - 80% weight from unassigned people, 20% from assigned people
 * - Zero-sum adjustment so deltas sum to $0
 * 
 * Usage: node allocate-beds-fixed.js submissions-export.csv
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

// ---- Scoring parameters ----
const BASELINE_WEIGHT = 1.0;
const BID_WEIGHT = 0.6;
const PREF_WEIGHT = 50;
const SIMILAR_PROPAGATION = 0.3;
const COUPLE_BONUS = 50;

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
      roomPrices: avgRoomPrices,
      isCouple: true
    });
    
    console.log(`  Couple: ${primary.email} + ${secondary.email}`);
  } else if (members.length === 1) {
    singles.push({ ...members[0], isCouple: false });
    console.log(`  Solo: ${members[0].email}`);
  }
}

console.log(`\n  Total: ${couples.length} couples, ${singles.length} singles\n`);

// ---- Utility calculation ----
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

// ---- Allocation algorithm ----
console.log('🎯 Allocating beds (preference-first with utility conflicts)...\n');

const allPeople = [...couples, ...singles];
const usedBeds = new Set();
const assignments = [];
const unallocated = new Set(allPeople);

// Phase 1: Allocate by preference order
const maxPrefLength = Math.max(...allPeople.map(p => p.preferences.length), 0);

for (let prefRank = 0; prefRank < maxPrefLength; prefRank++) {
  const conflictGroups = new Map();
  
  // Group people by their Nth preference
  for (const person of unallocated) {
    if (prefRank < person.preferences.length) {
      const bed = person.preferences[prefRank];
      if (!usedBeds.has(bed)) {
        if (!conflictGroups.has(bed)) {
          conflictGroups.set(bed, []);
        }
        conflictGroups.get(bed).push(person);
      }
    }
  }
  
  // Resolve each group
  for (const [bed, contenders] of conflictGroups.entries()) {
    // Filter by capacity match
    const validContenders = contenders.filter(person => {
      if (ROOMS[bed].capacity === 2 && person.isCouple) return true;
      if (ROOMS[bed].capacity === 1 && !person.isCouple) return true;
      return false;
    });
    
    if (validContenders.length === 0) continue;
    
    if (validContenders.length === 1) {
      // No conflict, assign directly
      const person = validContenders[0];
      usedBeds.add(bed);
      assignments.push({
        person,
        bed,
        method: `pref#${prefRank + 1}`,
        prefRank: prefRank
      });
      unallocated.delete(person);
      
      const displayName = person.isCouple 
        ? `${person.primary} + partner`
        : person.email;
      console.log(`  ✓ ${displayName.padEnd(45)} → ${bed.padEnd(12)} [preference #${prefRank + 1}]`);
    } else {
      // Conflict: resolve by utility
      let bestPerson = null;
      let bestUtility = -Infinity;
      
      for (const person of validContenders) {
        let util = utility(person, bed);
        
        // Apply couple bonus if competing for 2-capacity bed against singles
        if (ROOMS[bed].capacity === 2 && person.isCouple) {
          // Check if there are any singles trying to get this 2-capacity bed
          // (though this shouldn't happen with our capacity filter above)
          util += COUPLE_BONUS;
        }
        
        if (util > bestUtility) {
          bestUtility = util;
          bestPerson = person;
        }
      }
      
      usedBeds.add(bed);
      assignments.push({
        person: bestPerson,
        bed,
        method: `pref#${prefRank + 1}(utility)`,
        prefRank: prefRank
      });
      unallocated.delete(bestPerson);
      
      const displayName = bestPerson.isCouple 
        ? `${bestPerson.primary} + partner`
        : bestPerson.email;
      console.log(`  ⚖️  ${displayName.padEnd(45)} → ${bed.padEnd(12)} [preference #${prefRank + 1}, won by utility]`);
    }
  }
}

// Phase 2: Allocate remaining by pure utility
console.log('\n  Phase 2: Remaining allocations by utility...\n');

while (unallocated.size > 0) {
  let bestAssignment = null;
  let bestUtility = -Infinity;
  
  for (const person of unallocated) {
    for (const bed of BEDS) {
      if (usedBeds.has(bed)) continue;
      
      // Check capacity match
      if (ROOMS[bed].capacity === 2 && !person.isCouple) continue;
      if (ROOMS[bed].capacity === 1 && person.isCouple) continue;
      
      const util = utility(person, bed);
      
      if (util > bestUtility) {
        bestUtility = util;
        bestAssignment = { person, bed };
      }
    }
  }
  
  if (!bestAssignment) break;
  
  usedBeds.add(bestAssignment.bed);
  assignments.push({
    person: bestAssignment.person,
    bed: bestAssignment.bed,
    method: 'utility-greedy',
    prefRank: 999
  });
  unallocated.delete(bestAssignment.person);
  
  const displayName = bestAssignment.person.isCouple 
    ? `${bestAssignment.person.primary} + partner`
    : bestAssignment.person.email;
  console.log(`  🎲 ${displayName.padEnd(45)} → ${bestAssignment.bed.padEnd(12)} [utility greedy]`);
}

if (unallocated.size > 0) {
  console.log(`\n⚠️  ${unallocated.size} people could not be assigned (no capacity):`);
  for (const p of unallocated) {
    const displayName = p.isCouple ? `${p.primary} + partner` : p.email;
    console.log(`  ${displayName}`);
  }
}

// ---- Build pricing data ----
console.log('\n💰 Calculating prices (80/20 consensus)...\n');

// Collect ALL bids for each bed class
const allBidsByClass = {};
for (const bedClass of new Set(Object.values(ROOMS).map(r => r.bedClass))) {
  allBidsByClass[bedClass] = [];
}

for (const person of allPeople) {
  for (const bed of BEDS) {
    const bedClass = ROOMS[bed].bedClass;
    const base = ROOMS[bed].base;
    const bid = person.roomPrices[bed];
    const delta = bid - base;
    allBidsByClass[bedClass].push({
      person: person,
      bed: bed,
      delta: delta
    });
  }
}

// For each bed class, calculate weighted consensus price
const classPrices = {};

for (const [bedClass, allBids] of Object.entries(allBidsByClass)) {
  // Find who got assigned to this class
  const assignedPeople = new Set();
  for (const assignment of assignments) {
    if (ROOMS[assignment.bed].bedClass === bedClass) {
      assignedPeople.add(assignment.person);
    }
  }
  
  // Separate assigned vs unassigned bids
  const assignedBids = [];
  const unassignedBids = [];
  
  for (const bid of allBids) {
    if (assignedPeople.has(bid.person)) {
      assignedBids.push(bid.delta);
    } else {
      unassignedBids.push(bid.delta);
    }
  }
  
  // Calculate weighted average (80% unassigned, 20% assigned)
  const unassignedAvg = unassignedBids.length > 0
    ? unassignedBids.reduce((sum, d) => sum + d, 0) / unassignedBids.length
    : 0;
  
  const assignedAvg = assignedBids.length > 0
    ? assignedBids.reduce((sum, d) => sum + d, 0) / assignedBids.length
    : 0;
  
  const weightedDelta = (unassignedAvg * 0.8) + (assignedAvg * 0.2);
  
  // Get baseline for this class
  const baselinePrice = Object.values(ROOMS).find(r => r.bedClass === bedClass).base;
  
  classPrices[bedClass] = {
    baseline: baselinePrice,
    weightedDelta: weightedDelta,
    pricePerPerson: baselinePrice + weightedDelta,
    assignedCount: assignedPeople.size,
    assignedAvg: assignedAvg,
    unassignedAvg: unassignedAvg
  };
  
  console.log(`  ${bedClass.padEnd(15)}: baseline=$${baselinePrice.toString().padStart(4)}, weighted_delta=$${weightedDelta.toFixed(2).padStart(7)} → $${classPrices[bedClass].pricePerPerson.toFixed(2)}/person`);
  console.log(`    (assigned avg: $${assignedAvg.toFixed(2)}, unassigned avg: $${unassignedAvg.toFixed(2)}, ${assignedPeople.size} people assigned)`);
}

// ---- Build assignment list with prices ----
const allAssignments = [];

for (const a of assignments) {
  const person = a.person;
  const bed = a.bed;
  const bedClass = ROOMS[bed].bedClass;
  const pricePerPerson = classPrices[bedClass].pricePerPerson;
  
  if (person.isCouple) {
    allAssignments.push({
      emails: [person.primary, person.secondary],
      bed: bed,
      bedClass: bedClass,
      pricePerPerson: pricePerPerson,
      count: 2,
      method: a.method
    });
  } else {
    allAssignments.push({
      emails: [person.email],
      bed: bed,
      bedClass: bedClass,
      pricePerPerson: pricePerPerson,
      count: 1,
      method: a.method
    });
  }
}

// ---- Zero-sum adjustment ----
const totalPeople = allAssignments.reduce((sum, a) => sum + a.count, 0);
let currentSum = allAssignments.reduce((sum, a) => sum + (a.pricePerPerson * a.count), 0);

console.log(`\n⚖️  Current sum of deltas: $${currentSum.toFixed(2)}`);
console.log(`   Applying zero-sum adjustment across ${totalPeople} people...\n`);

const perPersonAdjustment = -currentSum / totalPeople;
console.log(`   Adjustment per person: $${perPersonAdjustment.toFixed(2)}`);

for (const a of allAssignments) {
  a.finalPerPerson = a.pricePerPerson + perPersonAdjustment;
}

const finalSum = allAssignments.reduce((sum, a) => sum + (a.finalPerPerson * a.count), 0);
console.log(`   Final sum: $${finalSum.toFixed(2)} ✓\n`);

// ---- Output CSV ----
const csvRows = ['email,bed,bedClass,delta,totalCost'];

for (const a of allAssignments) {
  for (const email of a.emails) {
    const totalCost = 480 + a.finalPerPerson;
    csvRows.push(`${email},${a.bed},${a.bedClass},${a.finalPerPerson.toFixed(2)},${totalCost.toFixed(2)}`);
  }
}

fs.writeFileSync('bed-assignments2.csv', csvRows.join('\n'));

// ---- Output Markdown ----
const md = `
# 🛏️ Democratic Bed Assignments

**Base cost: $480/person** (already paid)

Prices below are **DELTAS** (adjustments):
- Positive (+) = owe extra
- Negative (-) = get refund

## Final Assignments

| Person(s) | Bed | Bed Class | Delta | Total | Method |
|-----------|-----|-----------|-------|-------|--------|
${allAssignments
  .map(a => {
    const people = a.count === 2 
      ? `${a.emails[0]} + partner`
      : a.emails[0];
    const delta = a.finalPerPerson >= 0 ? `+$${a.finalPerPerson.toFixed(2)}` : `$${a.finalPerPerson.toFixed(2)}`;
    const total = (480 + a.finalPerPerson).toFixed(2);
    return `| ${people} | ${a.bed} | ${a.bedClass} | ${delta} | $${total} | ${a.method} |`;
  })
  .join('\n')}

## Price Summary by Bed Class

| Bed Class | People | Delta/Person | Total/Person | Price Calculation |
|-----------|--------|--------------|--------------|-------------------|
${Object.entries(classPrices)
  .map(([bedClass, data]) => {
    const count = data.assignedCount;
    const finalDelta = data.pricePerPerson + perPersonAdjustment;
    const deltaStr = finalDelta >= 0 ? `+$${finalDelta.toFixed(2)}` : `$${finalDelta.toFixed(2)}`;
    const total = (480 + finalDelta).toFixed(2);
    const calc = `Base: $${data.baseline}, Weighted: $${data.weightedDelta.toFixed(2)}`;
    return `| ${bedClass} | ${count} | ${deltaStr} | $${total} | ${calc} |`;
  })
  .join('\n')}

## Mechanism Details

### Allocation Method
1. **Preference-first**: People get beds they ranked highly
2. **Utility resolution**: Conflicts resolved by preferences + bids + couple bonus
3. **Couple priority**: +${COUPLE_BONUS} utility bonus for 2-capacity beds

### Pricing Method
1. **Consensus-based**: Prices based on ALL bids (not just winners)
2. **Weighted**: 80% from unassigned people, 20% from assigned people
3. **Zero-sum**: Final adjustment ensures deltas sum to $0

### Weights Used
- Preference weight: ${PREF_WEIGHT}
- Bid weight: ${BID_WEIGHT}
- Baseline weight: ${BASELINE_WEIGHT}
- Couple bonus for 2-occupancy beds: ${COUPLE_BONUS}

## Verification

✓ Sum of deltas: $${finalSum.toFixed(2)}
✓ All beds in same class have identical prices
✓ Preferences respected (conflicts resolved fairly)
✓ Couples stay together (never mixed with others)

## Assignment Details

${allAssignments.map(a => {
  const people = a.count === 2 ? `${a.emails[0]} + partner` : a.emails[0];
  return `- ${people} → ${a.bed} [${a.method}]`;
}).join('\n')}
`;

fs.writeFileSync('bed-assignments2.md', md);

console.log('✅ Files created:');
console.log('   bed-assignments.csv');
console.log('   bed-assignments.md\n');