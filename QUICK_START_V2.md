# Quick Start Guide - Room Selector v2.0

## 🎯 Overview

Multi-tenant room assignment system. Create unlimited trips, each with custom rooms and participants.

---

## ⚡ 5-Minute Setup

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create project (disable Analytics if you want)
3. Enable **Firestore Database** → Start in production mode
4. Go to **Rules** tab → Paste the rules from `firestore.rules`
5. Click **Publish**
6. Go to **Project Settings** → Add web app → Copy config
7. Paste config into `src/firebase.js` (lines 4-11)

### 2. Install & Run

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

Open http://localhost:5173

### 3. Test It Out

1. Click "Create New Trip"
2. Enter trip name and add a few rooms
3. Copy the participant link
4. Open in a new tab (or incognito window)
5. Submit preferences
6. Use admin code to view dashboard

### 4. Deploy

```bash
# Update homepage in package.json if needed
# Then deploy:
npm run deploy
```

Enable GitHub Pages: Repo → Settings → Pages → Source: gh-pages branch

---

## 🏗️ File Structure

```
src/
├── components/
│   ├── HomePage.jsx         # Landing page
│   ├── TripCreator.jsx      # Create trip + add rooms
│   ├── TripJoin.jsx         # Enter trip code
│   ├── SubmissionForm.jsx   # Submit preferences
│   └── AdminDashboard.jsx   # View metrics
├── App.jsx                  # Routing
├── firebase.js              # Config (UPDATE THIS!)
├── main.jsx                 # Entry point
└── index.css                # Tailwind styles
```

---

## 🔐 How Codes Work

**Admin Code (10 chars):**
- View all emails
- Export data
- See who submitted
- Example: `ABC123XYZ9`

**Participant Code (8 chars):**
- Join trip
- Submit preferences
- Example: `DEF45678`

Both generated automatically when you create a trip.

---

## 📱 User Flows

### Trip Organizer Flow

```
Homepage → Create Trip → Enter details → Add rooms
  ↓
Get codes (admin + participant)
  ↓
Share participant link with group
  ↓
Go to admin dashboard (use admin code)
  ↓
View submissions → Export data → Run allocation
```

### Participant Flow

```
Click organizer's link → Enter email
  ↓
Rank rooms → Adjust prices (must balance to $0)
  ↓
Submit → Done!
```

---

## 💾 Database Structure

**Collections:**

```javascript
trips/
  {tripId}/
    name: string
    baseCostPerPerson: number
    adminCode: string (10 chars)
    participantCode: string (8 chars)
    status: "collecting" | "finalized"
    createdAt: ISO date

rooms/
  {roomId}/
    tripId: string
    name: string
    description: string
    basePrice: number
    capacity: number
    type: string
    note: string

submissions/
  {submissionId}/
    tripId: string
    email: string
    preferences: [roomId1, roomId2, ...]
    roomPrices: [{id, name, price, basePrice}, ...]
    totalAdjustment: number (must be 0)
    timestamp: ISO date
```

---

## 🎨 Features

✅ Unlimited trips
✅ Custom rooms per trip
✅ Code-based access (no accounts)
✅ Admin dashboard
✅ Room popularity metrics
✅ CSV/JSON export
✅ Duplicate email prevention
✅ Price balance validation
✅ Mobile responsive
✅ FREE (Firebase free tier)

---

## 🔧 Configuration

### Firebase Config

**IMPORTANT:** Update `src/firebase.js` with YOUR config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR-API-KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### GitHub Pages

If repo name isn't "room-selector", update `vite.config.js`:

```javascript
base: '/your-repo-name/',
```

---

## 🐛 Troubleshooting

**Blank page after deploy?**
- Check `base` in `vite.config.js` matches repo name
- Verify gh-pages branch is selected in repo settings

**"Trip not found" error?**
- Did you update firebase.js with YOUR config?
- Check Firestore console for data

**Can't submit preferences?**
- Price adjustments must sum to $0
- Email required
- At least one room must be ranked

**Admin code not working?**
- Code is case-sensitive
- Check for extra spaces
- Verify in Firestore that the code matches

---

## 📊 Next Steps

1. ✅ Get v2 running locally
2. ✅ Create a test trip
3. ✅ Submit test preferences
4. ✅ Verify admin dashboard works
5. ✅ Deploy to GitHub Pages
6. 🔄 Migrate old data (see MIGRATION_GUIDE.md)
7. 📈 Update allocation script (optional - see README-v2.md)

---

## 🚨 Important Notes

- **Allocation script not updated yet** - use export + run locally for now
- **No user accounts** - codes act as passwords
- **Codes can be shared** - anyone with the code can access
- **No password reset** - if code is lost, create new trip
- **Firebase free tier** - 50k reads/day, 20k writes/day (plenty!)

---

## 📚 More Info

- **Full documentation:** README-v2.md
- **Migration guide:** MIGRATION_GUIDE.md
- **Security rules:** firestore.rules

---

## 🎉 You're Ready!

Create your first trip and share it with your group. The system handles the rest!

Need help? Check:
1. Browser console (F12) for errors
2. Firebase Console for data
3. README-v2.md for detailed docs
