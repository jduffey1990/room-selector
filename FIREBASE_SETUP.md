# Firebase Setup Guide for Room Selector

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter a project name (e.g., "room-selector")
4. Follow the prompts (disable Google Analytics if you want, it's not needed)

## Step 2: Set Up Firestore Database

1. In your Firebase project, click "Firestore Database" in the left menu
2. Click "Create database"
3. Choose **"Start in production mode"** (we'll add security rules next)
4. Select a location closest to your users
5. Click "Enable"

## Step 3: Configure Security Rules

1. In Firestore, go to the "Rules" tab
2. Replace the rules with this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /submissions/{document} {
      // Anyone can read submissions
      allow read: if true;
      
      // Anyone can create a submission
      allow create: if true;
      
      // Nobody can update or delete (except via Firebase Console)
      allow update, delete: if false;
    }
  }
}
```

3. Click "Publish"

**Note:** These rules allow anyone to read/write. That's fine for your use case since:
- You want friends to submit anonymously
- Admin key protects email visibility in the UI
- You can manually delete spam via Firebase Console

## Step 4: Get Your Firebase Config

1. Click the gear icon ⚙️ next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon `</>`
5. Register your app (give it a name like "Room Selector")
6. Copy the `firebaseConfig` object - it looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

7. **Replace** the config in `room-selector-firebase.jsx` (lines 7-13) with your actual config

## Step 5: Deploy to GitHub Pages

### Option A: Using Vite (Recommended)

1. Create a new folder for your project:
```bash
npm create vite@latest room-selector -- --template react
cd room-selector
```

2. Install dependencies:
```bash
npm install
npm install firebase
npm install lucide-react
```

3. Copy `room-selector-firebase.jsx` to `src/App.jsx`

4. Update your Firebase config in `App.jsx`

5. Install gh-pages:
```bash
npm install --save-dev gh-pages
```

6. Update `package.json`:
```json
{
  "homepage": "https://YOUR-USERNAME.github.io/room-selector",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

7. Update `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/room-selector/'
})
```

8. Push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/room-selector.git
git push -u origin main
```

9. Deploy:
```bash
npm run deploy
```

10. Enable GitHub Pages:
    - Go to your repo settings
    - Pages section
    - Source: gh-pages branch
    - Your site will be live at: `https://YOUR-USERNAME.github.io/room-selector`

### Option B: Using Create React App

Similar to above, but use `npx create-react-app room-selector` instead.

## Testing Locally

Before deploying, test locally:

```bash
npm run dev
# Open http://localhost:5173
```

## Viewing Submissions in Firebase Console

1. Go to Firebase Console
2. Click "Firestore Database"
3. You'll see all submissions in the `submissions` collection
4. Click any document to view details
5. You can manually delete spam/test submissions

## Troubleshooting

**"Firebase not initialized" error:**
- Make sure you replaced the Firebase config with your actual config
- Check that you have internet connection when testing

**"Permission denied" error:**
- Check your Firestore security rules
- Make sure they allow read/write

**Submissions not showing:**
- Check browser console for errors
- Verify Firebase config is correct
- Check Firestore rules

## Admin Key

The admin key is currently set to `shredder2026` in the code (line 48).
Change it to something secure before deploying!

## Cost

Firebase free tier includes:
- 50,000 document reads/day
- 20,000 document writes/day
- 1 GB stored

For 18 people submitting once = totally free! ✅
