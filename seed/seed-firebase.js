// Firebase Admin SDK Seeding Script
// Run with: node seed-firebase.js

const admin = require('firebase-admin');

// You'll need to download your service account key from Firebase Console
// Go to: Project Settings > Service Accounts > Generate New Private Key
// Save it as 'serviceAccountKey.json' in the same directory as this script
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const ROOM_TEMPLATES = [
  { id: 'bedroom1', name: 'Bedroom 1: Primary King Suite', basePrice: 200 },
  { id: 'bedroom2', name: 'Bedroom 2: King Room', basePrice: 150 },
  { id: 'bedroom3', name: 'Bedroom 3: King Room (Downstairs)', basePrice: 150 },
  { id: 'bedroom4', name: 'Bedroom 4: King Room', basePrice: 100 },
  { id: 'bedroom5a', name: 'Bedroom 5: Full Bunk (Top)', basePrice: -100 },
  { id: 'bedroom5b', name: 'Bedroom 5: Full Bunk (Bottom)', basePrice: -100 },
  { id: 'bedroom5c', name: 'Bedroom 5: Twin Bunk 1', basePrice: -100 },
  { id: 'bedroom5d', name: 'Bedroom 5: Twin Bunk 2', basePrice: -100 },
  { id: 'bedroom5e', name: 'Bedroom 5: Twin Bunk 3', basePrice: -100 },
  { id: 'bedroom5f', name: 'Bedroom 5: Twin Bunk 4', basePrice: -100 },
  { id: 'floor1', name: 'Floor Spot: Earth Napper', basePrice: -200 },
  { id: 'floor2', name: 'Floor Spot: Ground Chiller', basePrice: -200 },
];

// Realistic test submissions - ALL BALANCED (total adjustment = 0)
const testSubmissions = [
  // Person 1 & 2: Couple wanting primary suite, willing to pay more
  {
    email: 'alice.johnson@gmail.com',
    preferences: ['bedroom1', 'bedroom2', 'bedroom3', 'bedroom4'],
    priceAdjustments: { bedroom1: 250, bedroom2: 175, bedroom5c: -125, bedroom5d: -125, bedroom5e: -125 } // +50 +25 -25 -25 -25 = 0
  },
  {
    email: 'alice.johnson+copy@gmail.com',
    preferences: ['bedroom1', 'bedroom2', 'bedroom3', 'bedroom4'],
    priceAdjustments: { bedroom1: 250, bedroom2: 175, bedroom5c: -125, bedroom5d: -125, bedroom5e: -125 }
  },
  
  // Person 3 & 4: Budget conscious couple, prefer bunks
  {
    email: 'bob.smith@yahoo.com',
    preferences: ['bedroom5a', 'bedroom5b', 'bedroom4', 'bedroom3', 'bedroom2'],
    priceAdjustments: { bedroom5a: -150, bedroom5b: -150, bedroom1: 300 } // Total: 0
  },
  {
    email: 'bob.smith+copy@yahoo.com',
    preferences: ['bedroom5a', 'bedroom5b', 'bedroom4', 'bedroom3', 'bedroom2'],
    priceAdjustments: { bedroom5a: -150, bedroom5b: -150, bedroom1: 300 }
  },
  
  // Person 5 & 6: Want privacy but flexible on price
  {
    email: 'charlie.brown@outlook.com',
    preferences: ['bedroom2', 'bedroom3', 'bedroom4', 'bedroom1'],
    priceAdjustments: {} // Total: 0
  },
  {
    email: 'charlie.brown+copy@outlook.com',
    preferences: ['bedroom2', 'bedroom3', 'bedroom4', 'bedroom1'],
    priceAdjustments: {}
  },
  
  // Person 7 & 8: Really want king room, downstairs preferred
  {
    email: 'diana.martinez@gmail.com',
    preferences: ['bedroom3', 'bedroom2', 'bedroom4', 'bedroom1'],
    priceAdjustments: { bedroom3: 200, bedroom2: 175, bedroom5c: -125, bedroom5e: -125, bedroom5f: -125 } // +50 +25 -25 -25 -25 = 0
  },
  {
    email: 'diana.martinez+copy@gmail.com',
    preferences: ['bedroom3', 'bedroom2', 'bedroom4', 'bedroom1'],
    priceAdjustments: { bedroom3: 200, bedroom2: 175, bedroom5c: -125, bedroom5e: -125, bedroom5f: -125 }
  },
  
  // Person 9: Solo traveler, fine with bunk
  {
    email: 'ethan.lee@proton.me',
    preferences: ['bedroom5c', 'bedroom5d', 'bedroom5e', 'bedroom4', 'bedroom3'],
    priceAdjustments: { bedroom5c: -125, bedroom1: 125 } // Total: 0
  },
  
  // Person 10: Solo traveler, prefers privacy
  {
    email: 'fiona.green@icloud.com',
    preferences: ['bedroom4', 'bedroom3', 'bedroom2', 'bedroom5c', 'bedroom5d'],
    priceAdjustments: { bedroom4: 150, floor1: -250 } // +50 -50 = 0
  },
  
  // Person 11 & 12: Late to the party, flexible
  {
    email: 'george.wilson@gmail.com',
    preferences: ['bedroom4', 'bedroom5a', 'bedroom5b', 'bedroom5c', 'bedroom5d', 'bedroom5e'],
    priceAdjustments: {} // Total: 0
  },
  {
    email: 'george.wilson+copy@gmail.com',
    preferences: ['bedroom4', 'bedroom5a', 'bedroom5b', 'bedroom5c', 'bedroom5d', 'bedroom5e'],
    priceAdjustments: {}
  },
  
  // Person 13: Budget traveler, okay with floor
  {
    email: 'hannah.davis@gmail.com',
    preferences: ['bedroom5f', 'bedroom5e', 'bedroom5d', 'floor1', 'floor2'],
    priceAdjustments: { bedroom5f: -125, floor1: -225, bedroom3: 200 } // -25 -25 +50 = 0
  },
  
  // Person 14 & 15: Want the full bunk experience
  {
    email: 'ian.taylor@fastmail.com',
    preferences: ['bedroom5a', 'bedroom5b', 'bedroom5c', 'bedroom5d'],
    priceAdjustments: { bedroom5a: -125, bedroom5b: -125, bedroom1: 250 } // Total: 0
  },
  {
    email: 'ian.taylor+copy@fastmail.com',
    preferences: ['bedroom5a', 'bedroom5b', 'bedroom5c', 'bedroom5d'],
    priceAdjustments: { bedroom5a: -125, bedroom5b: -125, bedroom1: 250 }
  },
  
  // Person 16: Adventurous, actually wants floor spot
  {
    email: 'julia.anderson@pm.me',
    preferences: ['floor1', 'floor2', 'bedroom5f', 'bedroom5e', 'bedroom5d'],
    priceAdjustments: { floor1: -250, floor2: -250, bedroom1: 250, bedroom2: 200 } // -50 -50 +50 +50 = 0
  },
  
  // Person 17 & 18: Middle ground seekers
  {
    email: 'kevin.white@gmail.com',
    preferences: ['bedroom3', 'bedroom4', 'bedroom5a', 'bedroom5b', 'bedroom2'],
    priceAdjustments: { bedroom1: 250, bedroom3: 100, bedroom4: 75, bedroom5d: -75 } // +50 -50 -25 +25 = 0
  },
  {
    email: 'kevin.white+copy@gmail.com',
    preferences: ['bedroom3', 'bedroom4', 'bedroom5a', 'bedroom5b', 'bedroom2'],
    priceAdjustments: { bedroom1: 250, bedroom3: 100, bedroom4: 75, bedroom5d: -75 }
  },
];

function applyPriceAdjustments(adjustments) {
  return ROOM_TEMPLATES.map(room => {
    const adjustedPrice = adjustments[room.id] !== undefined 
      ? room.basePrice + (adjustments[room.id] - room.basePrice)
      : room.basePrice;
    return {
      id: room.id,
      name: room.name,
      price: adjustedPrice
    };
  });
}

function calculateTotalAdjustment(roomPrices) {
  return roomPrices.reduce((sum, room) => {
    const original = ROOM_TEMPLATES.find(r => r.id === room.id);
    return sum + (room.price - original.basePrice);
  }, 0);
}

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');
  
  // Clear existing submissions
  console.log('🗑️  Clearing existing submissions...');
  const existingDocs = await db.collection('submissions').get();
  const deletePromises = existingDocs.docs.map(doc => doc.ref.delete());
  await Promise.all(deletePromises);
  console.log(`✅ Deleted ${existingDocs.size} existing submissions\n`);
  
  // Add new submissions
  console.log('📝 Adding test submissions...\n');
  
  for (let i = 0; i < testSubmissions.length; i++) {
    const sub = testSubmissions[i];
    const roomPrices = applyPriceAdjustments(sub.priceAdjustments);
    const totalAdjustment = calculateTotalAdjustment(roomPrices);
    
    const submission = {
      email: sub.email,
      emailLower: sub.email.toLowerCase(),
      preferences: sub.preferences,
      roomPrices: roomPrices,
      timestamp: new Date(Date.now() - (18 - i) * 3600000).toISOString(), // Stagger timestamps
      totalAdjustment: totalAdjustment
    };
    
    await db.collection('submissions').add(submission);
    
    console.log(`✓ Added submission ${i + 1}/18: ${sub.email}`);
    console.log(`  Top choice: ${sub.preferences[0]}`);
    console.log(`  Total adjustment: ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment}`);
    console.log(`  Balanced: ${totalAdjustment === 0 ? '✅' : '❌'}\n`);
  }
  
  console.log('🎉 Database seeding complete!');
  console.log('\n📊 Summary:');
  console.log(`   Total submissions: ${testSubmissions.length}`);
  console.log(`   Balanced submissions: ${testSubmissions.filter(s => calculateTotalAdjustment(applyPriceAdjustments(s.priceAdjustments)) === 0).length}`);
  console.log(`   Unique emails: ${new Set(testSubmissions.map(s => s.email.split('+')[0])).size}`);
}

seedDatabase()
  .then(() => {
    console.log('\n✅ All done! You can now test the allocation algorithm.');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  });