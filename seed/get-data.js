// Firebase Admin SDK Export Script
// Run with: node get-data.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportSubmissions() {
  console.log('📤 Exporting submissions...\n');

  const snapshot = await db.collection('submissions').orderBy('timestamp').get();

  if (snapshot.empty) {
    console.log('⚠️ No submissions found.');
    return;
  }

  const records = [];

  snapshot.forEach(doc => {
    records.push({
      id: doc.id,
      ...doc.data()
    });
  });

  // ---- JSON EXPORT ----
  const jsonPath = path.join(__dirname, 'submissions-export.json');
  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

  // ---- CSV EXPORT ----
  const csvPath = path.join(__dirname, 'submissions-export.csv');

  const csvHeaders = [
    'id',
    'email',
    'preferences',
    'roomPrices',
    'totalAdjustment',
    'timestamp'
  ];

  const csvRows = [
    csvHeaders.join(','),
    ...records.map(r => [
      r.id,
      r.email,
      `"${r.preferences.join(' | ')}"`,
      `"${r.roomPrices.map(p => `${p.id}:${p.price}`).join(' | ')}"`,
      r.totalAdjustment,
      r.timestamp
    ].join(','))
  ];

  fs.writeFileSync(csvPath, csvRows.join('\n'));

  console.log(`✅ Export complete`);
  console.log(`📄 JSON: ${jsonPath}`);
  console.log(`📊 CSV:  ${csvPath}`);
  console.log(`📦 Records exported: ${records.length}`);
}

exportSubmissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Export failed:', err);
    process.exit(1);
  });
