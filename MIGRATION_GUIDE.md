# 🔄 Migration Guide: v1 → v2

This guide helps you upgrade from the single-tenant version to the new multi-tenant version.

---

## What Changed?

### Database Structure

**Before (v1):**
```
submissions/
  ├── {submissionId}
      ├── email
      ├── preferences
      ├── roomPrices
```

**After (v2):**
```
trips/
  ├── {tripId}
      
rooms/
  ├── {roomId}
      ├── tripId (foreign key)

submissions/
  ├── {submissionId}
      ├── tripId (foreign key)
      ├── email
      ├── preferences
      ├── roomPrices
```

### Code Structure

**Before:** One giant `App.jsx` with everything
**After:** Separate components with routing

---

## Migration Steps

### Step 1: Backup Existing Data

Before making any changes:

1. Go to Firebase Console
2. Export your existing submissions collection
3. Save as JSON backup

### Step 2: Update Firebase Rules

Replace your Firestore security rules with the new rules from `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['name', 'baseCostPerPerson', 'adminCode', 'participantCode', 'status', 'createdAt']);
      allow update, delete: if false;
    }
    
    match /rooms/{roomId} {
      allow read: if true;
      allow create: if request.resource.data.tripId is string;
      allow update, delete: if false;
    }
    
    match /submissions/{submissionId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['tripId', 'email', 'preferences', 'roomPrices', 'totalAdjustment', 'timestamp']);
      allow update, delete: if false;
    }
  }
}
```

### Step 3: Replace Source Files

1. Delete your old `src/App.jsx`
2. Copy the new `src/` directory from this package:
   - `src/App.jsx` (router setup)
   - `src/firebase.js` (Firebase config)
   - `src/components/` (all new components)
   - `src/index.css` (Tailwind styles)

3. **Important:** Update `src/firebase.js` with YOUR Firebase config (lines 4-11)

### Step 4: Install New Dependencies

```bash
npm install react-router-dom@^6.22.0
```

Or just run:
```bash
npm install
```

### Step 5: Migrate Existing Data (Optional)

If you want to preserve your old submissions in the new format:

**Option A: Manual Migration via Firebase Console**

1. Create a new trip document in the `trips` collection:
```javascript
{
  name: "Your Trip Name",
  baseCostPerPerson: 480,
  adminCode: "YOURADMIN",
  participantCode: "YOURCODE",
  status: "collecting",
  createdAt: new Date().toISOString()
}
```

2. Note the generated `tripId`

3. Create room documents in the `rooms` collection (one for each room):
```javascript
{
  tripId: "your-trip-id-from-step-1",
  name: "Bedroom 1: Primary King Suite",
  description: "King bed with fireplace...",
  basePrice: 200,
  capacity: 1,
  type: "king",
  note: "$680/person total"
}
```

4. Update each submission to add the `tripId` field:
```javascript
// For each existing submission, add:
{
  tripId: "your-trip-id-from-step-1",
  // ... existing fields
}
```

**Option B: Script-Based Migration**

Create a Node script using Firebase Admin SDK:

```javascript
// migrate.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  // 1. Create trip
  const tripRef = await db.collection('trips').add({
    name: 'Vail 2026',
    baseCostPerPerson: 480,
    adminCode: 'YOURADMIN',
    participantCode: 'YOURCODE',
    status: 'collecting',
    createdAt: new Date().toISOString()
  });
  
  const tripId = tripRef.id;
  console.log('Created trip:', tripId);
  
  // 2. Create rooms
  const rooms = [
    { name: 'Bedroom 1', basePrice: 200, type: 'king', capacity: 1, description: '...' },
    // ... add all your rooms
  ];
  
  for (const room of rooms) {
    await db.collection('rooms').add({
      tripId,
      ...room,
      note: `$${480 + room.basePrice}/person total`
    });
  }
  
  // 3. Update submissions
  const submissionsSnapshot = await db.collection('submissions').get();
  const batch = db.batch();
  
  submissionsSnapshot.docs.forEach(doc => {
    batch.update(doc.ref, { tripId });
  });
  
  await batch.commit();
  console.log('Migration complete!');
}

migrate();
```

Run with: `node migrate.js`

### Step 6: Test Locally

```bash
npm run dev
```

Visit http://localhost:5173 and test:
1. Homepage loads
2. Create new trip works
3. Join trip works
4. Submit preferences works
5. Admin dashboard works (use your admin code)

### Step 7: Deploy

```bash
npm run deploy
```

---

## Keeping Both Versions (Alternative Approach)

If you want to keep your old single-tenant version running while testing the new version:

1. Create a NEW Firebase project for v2
2. Deploy v2 to a different GitHub repo or subdirectory
3. Run both in parallel
4. Migrate gradually

---

## Troubleshooting

### "Trip not found" error
- Make sure you updated `src/firebase.js` with YOUR Firebase config
- Check that trips exist in your Firestore database

### Blank page after deploy
- Check that `vite.config.js` has the correct `base` path
- Make sure GitHub Pages is using the `gh-pages` branch

### Can't see submissions in admin dashboard
- Verify you're using the correct admin code
- Check browser console for errors
- Ensure submissions have a `tripId` field

### Old submissions not showing
- If you migrated data, ensure all submissions have the `tripId` field
- Check Firestore console to verify data structure

---

## Rollback Plan

If something goes wrong:

1. **Revert code:** `git checkout main` (or your old branch)
2. **Revert Firebase rules:** Restore old security rules from Firebase Console
3. **Redeploy:** `npm run deploy`

Your data in Firestore is preserved unless you explicitly deleted it.

---

## Need Help?

If you get stuck:
1. Check browser console (F12) for errors
2. Check Firebase Console for data structure
3. Review the new README-v2.md for documentation
4. Test each route individually to isolate issues

---

## Summary Checklist

- [ ] Backed up existing Firestore data
- [ ] Updated Firebase security rules
- [ ] Replaced src/ files
- [ ] Updated firebase.js with YOUR config
- [ ] Installed react-router-dom
- [ ] Tested locally
- [ ] Migrated existing data (if needed)
- [ ] Deployed successfully
- [ ] Verified all routes work

---

Good luck with the migration! 🚀
