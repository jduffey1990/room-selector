/**
 * v1 allocation algorithm — weighted score + greedy assignment.
 *
 * Extracted verbatim from index.js. Behaviour is unchanged: this is a pure
 * function of its inputs, so it can be tested without Firestore.
 *
 * SUPERSEDED. seed/allocate-envyfree.js implements the envy-free replacement,
 * which on the January 2026 data removed all 9 envy violations and stopped
 * charging six people more than they said their bed was worth. Porting it here
 * is the intended next change; see ARCHITECTURE.md.
 *
 * Known defects, preserved deliberately so the refactor stays behaviour-neutral:
 *  - Greedy assignment is order-dependent: singles are allocated in submission
 *    order, so filling the form early is worth money.
 *  - `person.roomPrices[bed]` has no fallback in utility() while the couples
 *    path does, so a room added after someone submits yields NaN, and every
 *    `score > bestScore` comparison is then false — that person silently gets
 *    the first available bed.
 *  - BASELINE_WEIGHT is applied to a bed's base price, which is identical for
 *    every person, so it does not discriminate between candidates. It only
 *    inflates expensive beds for everyone, amplifying the order-dependence.
 */

const {HttpsError} = require("firebase-functions/v2/https");

// Scoring parameters
const BASELINE_WEIGHT = 2.0;
const BID_WEIGHT = 0.8;
const PREF_WEIGHT = 25;
const SIMILAR_PROPAGATION = 0.3;
/**
 * Computes bed assignments and per-person price adjustments.
 * @param {!Array<!Object>} roomDocs Rooms as {id, name, basePrice, capacity,
 *     type}.
 * @param {!Array<!Object>} submissionDocs Submissions as {email, preferences,
 *     roomPrices}.
 * @return {{assignments: !Array<!Object>, coupleCount: number,
 *     singleCount: number}} Assignments plus the couple/single split, which the
 *     dashboard reports back to the organiser.
 */
function computeAllocation(roomDocs, submissionDocs) {
  const rooms = {};
  const beds = [];
  const doubleBeds = [];
  const singleBeds = [];

  roomDocs.forEach((room) => {
    rooms[room.id] = {
      base: room.basePrice,
      bedClass: room.type,
      capacity: room.capacity,
      name: room.name,
    };
    beds.push(room.id);

    if (room.capacity === 2) {
      doubleBeds.push(room.id);
    } else {
      singleBeds.push(room.id);
    }
  });

  // Utility function
  const utility = (person, bed) => {
    const {base, bedClass} = rooms[bed];
    const bid = person.roomPrices[bed];
    const bidDelta = bid - base;

    let rank = person.preferences.indexOf(bed);
    if (rank === -1) {
      rank = person.preferences.length;
    }

    const maxRank = Math.max(person.preferences.length, beds.length);
    const prefScore = (maxRank - rank) * PREF_WEIGHT;

    let similarityBoost = 0;
    if (person.preferences.length > 0) {
      const topChoice = person.preferences[0];
      const topBed = rooms[topChoice];

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
  };

  if (submissionDocs.length === 0) {
    throw new HttpsError("failed-precondition", "No submissions found");
  }

  const people = submissionDocs.map((data) => {
    const roomPricesObj = {};
    data.roomPrices.forEach((rp) => {
      roomPricesObj[rp.id] = rp.price;
    });

    return {
      email: data.email,
      preferences: data.preferences,
      roomPrices: roomPricesObj,
    };
  });

  // Detect couples
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
      const primary = members.find((m) => !m.email.includes("+copy")) ||
        members[0];
      const secondary = members.find((m) => m.email.includes("+copy")) ||
        members[1];

      const avgRoomPrices = {};
      for (const bed of beds) {
        const price1 = primary.roomPrices[bed] || rooms[bed].base;
        const price2 = secondary.roomPrices[bed] || rooms[bed].base;
        avgRoomPrices[bed] = (price1 + price2) / 2;
      }

      couples.push({
        id: baseEmail,
        primary: primary.email,
        secondary: secondary.email,
        preferences: primary.preferences,
        roomPrices: avgRoomPrices,
      });
    } else if (members.length === 1) {
      singles.push(members[0]);
    }
  }

  // Allocate couples
  const usedBeds = new Set();
  const coupleAssignments = [];

  for (const couple of couples) {
    let bestOption = null;

    // Try double beds
    for (const bed of doubleBeds) {
      if (usedBeds.has(bed)) continue;

      const score = utility(couple, bed);
      if (!bestOption || score > bestOption.score) {
        bestOption = {
          type: "double",
          beds: [bed],
          score: score,
        };
      }
    }

    // Try two singles of same class
    const singleBedsByClass = {};
    for (const bed of singleBeds) {
      if (usedBeds.has(bed)) continue;
      const bedClass = rooms[bed].bedClass;
      if (!singleBedsByClass[bedClass]) {
        singleBedsByClass[bedClass] = [];
      }
      singleBedsByClass[bedClass].push(bed);
    }

    for (const availableBeds of Object.values(singleBedsByClass)) {
      if (availableBeds.length >= 2) {
        const bed1 = availableBeds[0];
        const bed2 = availableBeds[1];

        const score1 = utility(couple, bed1);
        const score2 = utility(couple, bed2);
        const avgScore = (score1 + score2) / 2;

        if (!bestOption || avgScore > bestOption.score) {
          bestOption = {
            type: "double-single",
            beds: [bed1, bed2],
            score: avgScore,
          };
        }
      }
    }

    if (!bestOption) continue;

    for (const bed of bestOption.beds) {
      usedBeds.add(bed);
    }

    coupleAssignments.push({
      couple: couple,
      beds: bestOption.beds,
      type: bestOption.type,
    });
  }

  // Allocate singles
  const singleAssignments = [];

  for (const single of singles) {
    let bestBed = null;
    let bestScore = null;

    for (const bed of beds) {
      if (usedBeds.has(bed)) continue;

      const score = utility(single, bed);
      if (bestScore === null || score > bestScore) {
        bestBed = bed;
        bestScore = score;
      }
    }

    if (!bestBed) continue;

    usedBeds.add(bestBed);
    singleAssignments.push({
      single: single,
      bed: bestBed,
    });
  }

  // Build assignments with prices
  const allAssignments = [];

  for (const ca of coupleAssignments) {
    const couple = ca.couple;
    const bedClass = rooms[ca.beds[0]].bedClass;

    if (ca.type === "double") {
      const price = couple.roomPrices[ca.beds[0]];

      allAssignments.push({
        emails: [couple.primary, couple.secondary],
        beds: rooms[ca.beds[0]].name,
        bedIds: ca.beds,
        bedClass: bedClass,
        pricePerPerson: price,
      });
    } else {
      const price1 = couple.roomPrices[ca.beds[0]];
      const price2 = couple.roomPrices[ca.beds[1]];

      allAssignments.push({
        emails: [couple.primary],
        beds: rooms[ca.beds[0]].name,
        bedIds: [ca.beds[0]],
        bedClass: bedClass,
        pricePerPerson: price1,
      });

      allAssignments.push({
        emails: [couple.secondary],
        beds: rooms[ca.beds[1]].name,
        bedIds: [ca.beds[1]],
        bedClass: bedClass,
        pricePerPerson: price2,
      });
    }
  }

  for (const sa of singleAssignments) {
    const single = sa.single;
    const bed = sa.bed;
    const bedClass = rooms[bed].bedClass;
    const price = single.roomPrices[bed];

    allAssignments.push({
      emails: [single.email],
      beds: rooms[bed].name,
      bedIds: [bed],
      bedClass: bedClass,
      pricePerPerson: price,
    });
  }

  // Normalize prices by bed class
  const classPrices = {};
  for (const a of allAssignments) {
    if (!classPrices[a.bedClass]) {
      classPrices[a.bedClass] = {total: 0, totalPeople: 0};
    }
    classPrices[a.bedClass].total += a.pricePerPerson * a.emails.length;
    classPrices[a.bedClass].totalPeople += a.emails.length;
  }

  const classAverages = {};
  for (const [bedClass, data] of Object.entries(classPrices)) {
    classAverages[bedClass] = data.total / data.totalPeople;
  }

  for (const a of allAssignments) {
    a.classAverage = classAverages[a.bedClass];
  }

  // Zero-sum adjustment
  const totalDelta = allAssignments.reduce(
      (sum, a) => sum + a.classAverage * a.emails.length, 0);
  const totalPeople = allAssignments.reduce(
      (sum, a) => sum + a.emails.length, 0);
  const perPersonAdjustment = -totalDelta / totalPeople;

  for (const a of allAssignments) {
    a.finalPerPerson = a.classAverage + perPersonAdjustment;
  }
  return {
    assignments: allAssignments,
    coupleCount: couples.length,
    singleCount: singles.length,
  };
}

module.exports = {computeAllocation};
