# Quick Start Guide - Room Selector

## Overview

This project lets your 18 friends vote on room preferences and adjust prices. All data is saved to Firebase (Google's free database service) so it works on GitHub Pages.

## What You Need

- A GitHub account
- Node.js installed ([download here](https://nodejs.org/))
- 10-15 minutes to set up

## Setup Steps

### 1. Set Up Firebase (5 minutes)

Follow the detailed instructions in `FIREBASE_SETUP.md`. Quick version:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Firestore Database
4. Copy your Firebase config
5. Paste it into `src/App.jsx` (lines 7-13)

### 2. Set Up Locally (2 minutes)

```bash
# Install dependencies
npm install

# Run locally to test
npm run dev
```

Open http://localhost:5173 in your browser. Try submitting a test vote!

### 3. Deploy to GitHub Pages (5 minutes)

```bash
# Create GitHub repo
# Go to github.com and create a new repo called "room-selector"

# Push your code
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/room-selector.git
git branch -M main
git push -u origin main

# Deploy to GitHub Pages
npm run deploy
```

### 4. Enable GitHub Pages

1. Go to your repo on GitHub
2. Click "Settings"
3. Click "Pages" in the sidebar
4. Under "Source", select "gh-pages" branch
5. Click Save

Your site will be live at: `https://YOUR-USERNAME.github.io/room-selector`

## Important Configuration

### Change the Admin Key

Open `src/App.jsx` and change line 48:
```javascript
const ADMIN_SECRET = 'shredder2026'; // Change this!
```

### Update Base Path

If your repo name is NOT "room-selector", update `vite.config.js`:
```javascript
base: '/your-repo-name/',
```

And `package.json`:
```json
"homepage": "https://YOUR-USERNAME.github.io/your-repo-name",
```

## Project Structure

```
room-selector/
├── src/
│   ├── App.jsx           # Main app (has Firebase config - UPDATE THIS!)
│   ├── main.jsx          # React entry point
│   └── index.css         # Tailwind styles
├── index.html            # HTML template
├── package.json          # Dependencies & scripts
├── vite.config.js        # Build config
├── tailwind.config.js    # Tailwind config
└── FIREBASE_SETUP.md     # Detailed Firebase setup
```

## Testing

1. Run `npm run dev`
2. Submit a test vote with your email
3. Try submitting with the same email again (should be blocked)
4. Click "Admin View"
5. Enter admin key to see emails
6. Try the export buttons

## Troubleshooting

**npm: command not found**
- Install Node.js from nodejs.org

**Firebase errors**
- Check that you updated the Firebase config in `src/App.jsx`
- Verify Firestore security rules in Firebase Console

**GitHub Pages shows blank page**
- Check that `base` in `vite.config.js` matches your repo name
- Make sure gh-pages branch is selected in repo Settings > Pages

**Can't see submissions**
- Open browser console (F12) to check for errors
- Verify Firebase config is correct
- Check Firestore rules allow reading

## Features

✅ Per-person pricing ($480 base)
✅ Sticky price balance indicator
✅ Duplicate email prevention
✅ Anonymous by default (admin key reveals emails)
✅ CSV & JSON export
✅ Mobile responsive
✅ Works on GitHub Pages (free!)

## Cost

100% FREE with Firebase free tier:
- 50,000 reads/day
- 20,000 writes/day
- 1 GB storage

For 18 people = well within limits! ✅

## Support

If you get stuck, check:
1. Browser console for errors (F12)
2. Firebase Console for data
3. GitHub Actions tab for deployment errors

Good luck with your trip! 🏔️
