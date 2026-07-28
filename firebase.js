import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - REPLACE WITH YOUR OWN CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAsD7jF_9vkhQfOMkQnIVN7LPDyxqMPIN8",
  authDomain: "room-selector.firebaseapp.com",
  projectId: "room-selector",
  storageBucket: "room-selector.firebasestorage.app",
  messagingSenderId: "663251955322",
  appId: "1:663251955322:web:9e90424704a6731c0655c3",
  measurementId: "G-S1WZV80GNX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
