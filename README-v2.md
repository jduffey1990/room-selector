# 🏠️ Democratic Room Assignment System - Multi-Tenant

A fair, transparent, and democratic room assignment platform for group trips. Now supports multiple trips running simultaneously!

## ✨ What's New (Version 2.0)

- **Multi-tenant**: Create unlimited trips, each with its own rooms and participants
- **Code-based access**: Each trip gets an admin code (for organizers) and participant code (for group members)
- **Admin dashboard**: View submission metrics, room popularity, and export data
- **Better routing**: Clean URLs with React Router

---

## 🚀 Quick Start

### For Trip Organizers

1. **Create a Trip**
   - Visit the homepage
   - Click "Create New Trip"
   - Enter trip details and add all available rooms
   - Get your admin code and participant link

2. **Share with Your Group**
   - Copy the participant link
   - Send it to everyone going on the trip
   - They'll use it to submit their room preferences

3. **View & Export Results**
   - Use your admin code to access the dashboard
   - See who has submitted
   - Export data as CSV or JSON
   - Run the allocation algorithm (see Allocation section)

### For Participants

1. **Join a Trip**
   - Click the link your organizer sent
   - Enter your email
   - Rank rooms in order of preference
   - Adjust prices (must balance to $0)
   - Submit!

---

## 📁 New Database Structure

```
Firestore Collections:

trips/
  ├── {tripId}
      ├── name: "Vail 2026"
      ├── baseCostPerPerson: 480
      ├── adminCode: "ABC123XYZ9"
      ├── participantCode: "DEF456"
      ├── status: "collecting" | "finalized"
      ├── createdAt: timestamp

rooms/
  ├── {roomId}
      ├── tripId: {tripId}
      ├── name: "Primary King Suite"
      ├── description: "King bed with fireplace..."
      ├── basePrice: 200
      ├── capacity: 1
      ├── type: "king"
      ├── note: "$680/person total"

submissions/
  ├── {submissionId}
      ├── tripId: {tripId}
      ├── email: "user@example.com"
      ├── preferences: ["room1", "room2", ...]
      ├── roomPrices: [{id, name, price, basePrice}, ...]
      ├── totalAdjustment: 0
      ├── timestamp: ISO date
```

---

## 🔧 Setup

### 1. Firebase Configuration

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Copy your config to `src/firebase.js` (lines 4-11)
4. Update Firestore security rules (use `firestore.rules`)

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Locally

```bash
npm run dev
```

### 4. Deploy to GitHub Pages

```bash
npm run deploy
```

---

## 🎯 Routes

- `/` - Homepage (create or join trip)
- `/create` - Create new trip
- `/join` - Join trip with code
- `/trip/:tripId` - Submit preferences
- `/admin/:tripId` - Admin dashboard (requires admin code)

---

## 🔐 Security

- **Admin Code** (10 characters): Full access to view emails and export data
- **Participant Code** (8 characters): Join trip and submit preferences
- **Firebase Rules**: Read/create allowed, update/delete only via console

---

## 📊 Running the Allocation

The allocation algorithm (`seed/allocate-beds.js`) has **not been updated yet** to work with the new multi-tenant structure. 

### Current Workaround:

1. Go to admin dashboard
2. Export submissions as CSV
3. Manually run `node allocate-beds.js submissions-export.csv` in the `seed/` directory
4. View results

### Future Enhancement:

Update `allocate-beds.js` to:
- Accept a `tripId` parameter
- Load rooms and submissions from Firestore for that trip
- Run allocation
- Optionally write results back to Firestore

---

## 🏗️ Project Structure

```
room-selector/
├── src/
│   ├── components/
│   │   ├── HomePage.jsx          # Landing page
│   │   ├── TripCreator.jsx       # Create new trip
│   │   ├── TripJoin.jsx          # Join with code
│   │   ├── SubmissionForm.jsx    # Submit preferences
│   │   └── AdminDashboard.jsx    # View submissions
│   ├── App.jsx                   # Router setup
│   ├── firebase.js               # Firebase config
│   ├── main.jsx                  # React entry
│   └── index.css                 # Tailwind styles
├── seed/                         # Allocation scripts
├── firestore.rules               # Security rules
├── package.json
├── vite.config.js
└── README.md
```

---

## 🎨 Features

✅ Multi-tenant architecture
✅ Code-based trip access (no user accounts needed)
✅ Admin dashboard with metrics
✅ Room popularity tracking
✅ Export to CSV/JSON
✅ Duplicate email prevention (per trip)
✅ Price balance validation
✅ Mobile responsive
✅ Works on GitHub Pages
✅ Zero-cost (Firebase free tier)

---

## 💡 Philosophy

This system is intentionally:

- **Non-adversarial**: No bidding wars or gaming
- **Explainable**: Non-engineers can understand it
- **Transparent**: All logic is auditable
- **Fair**: Produces outcomes everyone can defend

It may not make everyone *perfectly happy*, but should make everyone say:

> "Yes — that was fair."

---

## 📝 License

UNLICENSED - no reproduction or use without explicit permission
