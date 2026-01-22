# Firebase Seeding Instructions

## What This Does

Seeds your Firebase database with 18 realistic test submissions featuring:
- 9 couples (using +copy email trick)
- Varied room preferences (some want luxury, some budget)
- Different price adjustment strategies
- Mix of balanced and unbalanced pricing
- Realistic preference patterns

## Setup Steps

### 1. Get Your Service Account Key

This is different from your web API key - it's for admin/backend access:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ → "Project settings"
4. Go to "Service accounts" tab
5. Click "Generate new private key"
6. Save the downloaded JSON file as `serviceAccountKey.json`

⚠️ **IMPORTANT**: This file contains actual secrets! Don't commit it to Git!

### 2. Install Dependencies

```bash
npm install firebase-admin
```

### 3. Place Files

Put these files in the same directory:
- `seed-firebase.js` (the script)
- `serviceAccountKey.json` (your credentials)

### 4. Run the Script

```bash
node seed-firebase.js
```

## What You'll See

```
🌱 Starting database seeding...

🗑️  Clearing existing submissions...
✅ Deleted X existing submissions

📝 Adding test submissions...

✓ Added submission 1/18: alice.johnson@gmail.com
  Top choice: bedroom1
  Total adjustment: +150
  Balanced: ❌

✓ Added submission 2/18: alice.johnson+copy@gmail.com
  Top choice: bedroom1
  Total adjustment: +150
  Balanced: ❌

...

🎉 Database seeding complete!

📊 Summary:
   Total submissions: 18
   Balanced submissions: 6
   Unique emails: 9
```

## Test Data Overview

### Couple Personas

**Alice & Partner** - Want primary suite, willing to pay premium
- Top choice: Primary King Suite
- Strategy: Bid up king rooms, bid down bunks

**Bob & Partner** - Budget conscious
- Top choice: Full bunks
- Strategy: Bid down bunks, bid up expensive rooms

**Charlie & Partner** - Flexible on price
- Top choice: King Room 2
- Strategy: Keep prices as-is

**Diana & Partner** - Want privacy downstairs
- Top choice: King Room 3 (Downstairs)
- Strategy: Bid up preferred kings, bid down others

**George & Partner** - Late to the party
- Top choice: King Room 4
- Strategy: No adjustments, take what's left

**Ian & Partner** - Want the bunk experience
- Top choice: Full bunks
- Strategy: Make bunks cheaper

**Kevin & Partner** - Middle ground seekers
- Top choice: King Room 3
- Strategy: Moderate adjustments

### Solo Travelers

**Ethan** - Budget traveler, fine with bunks
**Fiona** - Wants some privacy
**Hannah** - Budget traveler, okay with floor
**Julia** - Adventurous, actually wants floor spot

## Verification

After running, check:

1. **Firebase Console**
   - Go to Firestore Database
   - Check "submissions" collection
   - Should see 18 documents

2. **Your App**
   - Run `npm run dev`
   - Click "Admin View"
   - Should see all 18 submissions

3. **Export Data**
   - Click "Export CSV" or "Export JSON"
   - Verify data looks correct

## Next Steps

Once seeded:
1. Start a new chat with Claude
2. Export the JSON from Admin View
3. Upload it and ask Claude to run allocation algorithm
4. See who gets which room!

## Cleanup

To remove all test data:

```javascript
// Quick cleanup script
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanup() {
  const snapshot = await db.collection('submissions').get();
  const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(deletePromises);
  console.log(`Deleted ${snapshot.size} submissions`);
  process.exit(0);
}

cleanup();
```

Save as `cleanup.js` and run with `node cleanup.js`

## Security Notes

⚠️ Add to `.gitignore`:
```
serviceAccountKey.json
*.json
!package.json
```

This prevents accidentally committing your admin credentials!

## Troubleshooting

**Error: "Cannot find module 'firebase-admin'"**
→ Run `npm install firebase-admin`

**Error: "ENOENT: no such file 'serviceAccountKey.json'"**
→ Download the service account key and save it in the same directory

**Error: "Permission denied"**
→ Make sure you downloaded the key from the correct Firebase project

**No errors but no data in Firestore**
→ Check you're looking at the right Firebase project in the console
