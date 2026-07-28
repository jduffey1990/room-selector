// Firebase Cleanup Script
// Removes all submissions from the database
// Run with: node cleanup.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanup() {
  console.log('🗑️  Starting cleanup...\n');
  
  const snapshot = await db.collection('submissions').get();
  
  if (snapshot.empty) {
    console.log('✅ No submissions to delete. Database is already clean!');
    process.exit(0);
  }
  
  console.log(`Found ${snapshot.size} submissions to delete...\n`);
  
  const deletePromises = snapshot.docs.map((doc, i) => {
    console.log(`  Deleting ${i + 1}/${snapshot.size}: ${doc.id}`);
    return doc.ref.delete();
  });
  
  await Promise.all(deletePromises);
  
  console.log(`\n✅ Successfully deleted ${snapshot.size} submissions!`);
  process.exit(0);
}

cleanup().catch(error => {
  console.error('❌ Error during cleanup:', error);
  process.exit(1);
});
