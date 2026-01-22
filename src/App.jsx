import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, DollarSign, CheckCircle2, BarChart3 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';

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
const db = getFirestore(app);

const INITIAL_ROOMS = [
  { id: 'bedroom1', name: 'Bedroom 1: Primary King Suite', description: 'King bed with fireplace, attached bathroom, and crib', basePrice: 200, capacity: 1, type: 'king', note: '$680/person total' },
  { id: 'bedroom2', name: 'Bedroom 2: King Room', description: 'King bed with attached bathroom', basePrice: 150, capacity: 1, type: 'king', note: '$630/person total' },
  { id: 'bedroom3', name: 'Bedroom 3: King Room (Downstairs)', description: 'King bed with attached bathroom', basePrice: 150, capacity: 1, type: 'king', note: '$630/person total' },
  { id: 'bedroom4', name: 'Bedroom 4: King Room', description: 'King bed, uses hall bathroom', basePrice: 100, capacity: 1, type: 'king', note: '$580/person total' },
  { id: 'bedroom5a', name: 'Bedroom 5: Full Bunk (Top)', description: 'Full/full bunkbed (top bunk), uses hall bathroom', basePrice: -100, capacity: 1, type: 'bunk', note: '$380/person total' },
  { id: 'bedroom5b', name: 'Bedroom 5: Full Bunk (Bottom)', description: 'Full/full bunkbed (bottom bunk), uses hall bathroom', basePrice: -100, capacity: 1, type: 'bunk', note: '$380/person total' },
  { id: 'bedroom5c', name: 'Bedroom 5: Twin Bunk 1', description: 'Twin/twin bunkbed, uses hall bathroom', basePrice: -100, capacity: 1, type: 'twin', note: '$380/person total' },
  { id: 'bedroom5d', name: 'Bedroom 5: Twin Bunk 2', description: 'Twin/twin bunkbed, uses hall bathroom', basePrice: -100, capacity: 1, type: 'twin', note: '$380/person total' },
  { id: 'bedroom5e', name: 'Bedroom 5: Twin Bunk 3', description: 'Twin/twin bunkbed, uses hall bathroom', basePrice: -100, capacity: 1, type: 'twin', note: '$380/person total' },
  { id: 'bedroom5f', name: 'Bedroom 5: Twin Bunk 4', description: 'Twin/twin bunkbed, uses hall bathroom', basePrice: -100, capacity: 1, type: 'twin', note: '$380/person total' },
  { id: 'floor1', name: 'Floor Spot: Earth Napper', description: 'Camping on carpet', basePrice: -200, capacity: 1, type: 'floor', note: '$280/person total' },
  { id: 'floor2', name: 'Floor Spot: Ground Chiller', description: 'Camping on carpet', basePrice: -200, capacity: 1, type: 'floor', note: '$280/person total' },
];

export default function RoomSelector() {
  const [view, setView] = useState('vote');
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [email, setEmail] = useState('');
  const [preferences, setPreferences] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [showEmails, setShowEmails] = useState(false);
  const ADMIN_SECRET = 'shredder2026';

  const totalAdjustment = rooms.reduce((sum, room) => {
    const originalRoom = INITIAL_ROOMS.find(r => r.id === room.id);
    return sum + (room.basePrice - originalRoom.basePrice);
  }, 0);
  const isBalanced = totalAdjustment === 0;

  useEffect(() => {
    if (view === 'admin') {
      loadSubmissions();
    }
  }, [view]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'submissions'));
      const subs = [];
      querySnapshot.forEach((doc) => {
        subs.push({ id: doc.id, ...doc.data() });
      });
      setSubmissions(subs);
    } catch (error) {
      console.error('Error loading submissions:', error);
      alert('Error loading submissions. Check Firebase setup.');
    }
    setLoading(false);
  };

  const adjustPrice = (roomId, delta) => {
    setRooms(rooms.map(room => 
      room.id === roomId 
        ? { ...room, basePrice: room.basePrice + delta }
        : room
    ));
  };

  const togglePreference = (roomId) => {
    setPreferences(prev => 
      prev.includes(roomId) 
        ? prev.filter(id => id !== roomId)
        : [...prev, roomId]
    );
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      alert('Please enter your email');
      return;
    }
    
    if (preferences.length === 0) {
      alert('Please select at least one room preference');
      return;
    }

    // Check for duplicate email
    try {
      const emailLower = email.trim().toLowerCase();
      const q = query(collection(db, 'submissions'), where('emailLower', '==', emailLower));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        alert('This email has already submitted a response. Each person can only submit once.');
        return;
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
    }

    const submission = {
      email: email.trim(),
      emailLower: email.trim().toLowerCase(),
      timestamp: new Date().toISOString(),
      roomPrices: rooms.map(r => ({ id: r.id, name: r.name, price: r.basePrice })),
      preferences: preferences,
      totalAdjustment
    };

    try {
      await addDoc(collection(db, 'submissions'), submission);
      setSubmitted(true);
    } catch (error) {
      console.error('Error saving submission:', error);
      alert('Error saving your submission. Please check your internet connection and try again.');
    }
  };

  const resetForm = () => {
    setRooms(INITIAL_ROOMS);
    setEmail('');
    setPreferences([]);
    setSubmitted(false);
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(submissions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-submissions-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const exportToCSV = () => {
    const headers = ['Email', 'Timestamp', 'Total Adjustment', 'First Choice', 'Second Choice', 'Third Choice', 'All Preferences'];
    const rows = submissions.map(sub => [
      sub.email,
      new Date(sub.timestamp).toLocaleString(),
      sub.totalAdjustment,
      sub.preferences[0] ? sub.roomPrices.find(r => r.id === sub.preferences[0])?.name : '',
      sub.preferences[1] ? sub.roomPrices.find(r => r.id === sub.preferences[1])?.name : '',
      sub.preferences[2] ? sub.roomPrices.find(r => r.id === sub.preferences[2])?.name : '',
      sub.preferences.map(p => sub.roomPrices.find(r => r.id === p)?.name).join(' | ')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `room-submissions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const checkAdminKey = () => {
    if (adminKey === ADMIN_SECRET) {
      setShowEmails(true);
    } else {
      alert('Incorrect admin key');
      setAdminKey('');
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-800 mb-4">Submission Received!</h2>
          <p className="text-gray-600 mb-6">
            Thanks for submitting your preferences. We'll sort out the room assignments after January 29th.
          </p>
          <button
            onClick={resetForm}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
          >
            Submit Another Response
          </button>
        </div>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 className="w-8 h-8" />
                Admin Dashboard
              </h1>
              <button
                onClick={() => setView('vote')}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Back to Voting
              </button>
            </div>

            {loading ? (
              <p className="text-gray-600">Loading submissions...</p>
            ) : submissions.length === 0 ? (
              <p className="text-gray-600">No submissions yet.</p>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-bold text-lg mb-2">Summary</h3>
                  <p className="text-gray-700">Total Submissions: <strong>{submissions.length}</strong></p>
                </div>

                {!showEmails && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 mb-3">
                      🔒 Submissions are anonymous. Enter admin key to reveal emails:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={adminKey}
                        onChange={(e) => setAdminKey(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && checkAdminKey()}
                        placeholder="Enter admin key"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={checkAdminKey}
                        className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition"
                      >
                        Unlock
                      </button>
                    </div>
                  </div>
                )}

                {showEmails && (
                  <div className="flex gap-3">
                    <button
                      onClick={exportToCSV}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                    >
                      📊 Export CSV
                    </button>
                    <button
                      onClick={exportToJSON}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                    >
                      📦 Export JSON
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  {submissions.map((sub, idx) => (
                    <div key={sub.id || idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {showEmails ? sub.email : `Anonymous User #${idx + 1}`}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(sub.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-sm ${
                          sub.totalAdjustment === 0 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          Total: {sub.totalAdjustment >= 0 ? '+' : ''}{sub.totalAdjustment}
                        </span>
                      </div>
                      
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">Room Preferences (in order):</p>
                        <ol className="list-decimal list-inside space-y-1">
                          {sub.preferences.map((prefId, i) => {
                            const room = sub.roomPrices.find(r => r.id === prefId);
                            return (
                              <li key={i} className="text-sm text-gray-600">
                                {room?.name || prefId} ({room?.price >= 0 ? '+' : ''}{room?.price}/person)
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      <details className="text-sm">
                        <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">
                          View Price Adjustments
                        </summary>
                        <div className="mt-2 pl-4 space-y-1">
                          {sub.roomPrices
                            .filter(r => {
                              const original = INITIAL_ROOMS.find(ir => ir.id === r.id);
                              return original && r.price !== original.basePrice;
                            })
                            .map(room => {
                              const original = INITIAL_ROOMS.find(ir => ir.id === room.id);
                              const diff = room.price - original.basePrice;
                              return (
                                <p key={room.id} className="text-gray-600">
                                  {room.name}: {original.basePrice >= 0 ? '+' : ''}{original.basePrice} → {room.price >= 0 ? '+' : ''}{room.price}/person
                                  <span className={diff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    ({diff >= 0 ? '+' : ''}{diff})
                                  </span>
                                </p>
                              );
                            })}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isBalanced ? 'bg-green-600' : 'bg-red-600'
      } text-white py-3 px-4 shadow-lg`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5" />
            <span className="font-semibold">Price Balance:</span>
            <span className="text-xl font-bold">
              {totalAdjustment >= 0 ? '+' : ''}{totalAdjustment}
            </span>
            {isBalanced && <CheckCircle2 className="w-5 h-5" />}
          </div>
          <span className="text-sm">
            {isBalanced ? '✓ Balanced!' : '✗ Must equal zero'}
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-16">
        <div className="bg-white rounded-xl shadow-lg p-6 md:p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
                Room Selection & Pricing
              </h1>
              <p className="text-gray-600">
                Adjust room prices (per person) and select your preferences
              </p>
              <p className="text-sm text-indigo-600 font-medium mt-1">
                Base cost: $480/person • Prices shown are adjustments from base
              </p>
            </div>
            <button
              onClick={() => setView('admin')}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm"
            >
              Admin View
            </button>
          </div>

          <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6">
            <p className="text-sm text-indigo-700">
              Adjust room prices using the up/down arrows. The sticky banner at the top shows your current balance.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {rooms.map(room => {
              const originalPrice = INITIAL_ROOMS.find(r => r.id === room.id).basePrice;
              const priceChange = room.basePrice - originalPrice;
              const isSelected = preferences.includes(room.id);
              const preferenceRank = preferences.indexOf(room.id) + 1;

              return (
                <div 
                  key={room.id} 
                  className={`border-2 rounded-lg p-4 transition ${
                    isSelected 
                      ? 'border-indigo-500 bg-indigo-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => togglePreference(room.id)}
                          className={`mt-1 px-3 py-1 rounded-full text-sm font-medium transition ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {isSelected ? `#${preferenceRank}` : 'Select'}
                        </button>
                        <div>
                          <h3 className="font-bold text-gray-800">{room.name}</h3>
                          <p className="text-sm text-gray-600">{room.description}</p>
                          <p className="text-xs text-gray-500 mt-1">{room.note}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-800">
                          {room.basePrice >= 0 ? '+' : ''}{room.basePrice}
                        </div>
                        <div className="text-xs text-gray-500">per person</div>
                        {priceChange !== 0 && (
                          <div className={`text-sm ${priceChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {priceChange > 0 ? '+' : ''}{priceChange} adjusted
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => adjustPrice(room.id, 25)}
                          className="bg-gray-100 hover:bg-gray-200 p-2 rounded transition"
                          title="Increase by $25/person"
                        >
                          <ChevronUp className="w-5 h-5 text-gray-700" />
                        </button>
                        <button
                          onClick={() => adjustPrice(room.id, -25)}
                          className="bg-gray-100 hover:bg-gray-200 p-2 rounded transition"
                          title="Decrease by $25/person"
                        >
                          <ChevronDown className="w-5 h-5 text-gray-700" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t pt-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Submit Your Preferences</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            
            {preferences.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Your Preferences (in order):</p>
                <ol className="list-decimal list-inside space-y-1">
                  {preferences.map((prefId, idx) => {
                    const room = rooms.find(r => r.id === prefId);
                    return (
                      <li key={idx} className="text-sm text-gray-600">
                        {room.name} ({room.basePrice >= 0 ? '+' : ''}{room.basePrice}/person)
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!email.trim() || preferences.length === 0}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
            >
              Submit Preferences
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-3">How It Works</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Everyone starts at $480/person base cost</li>
            <li>Use the up/down arrows to adjust room prices (changes by $25/person per click)</li>
            <li>Total adjustments must balance to zero before submission</li>
            <li>Click "Select" to choose your preferred rooms (in order of preference)</li>
            <li>Enter your email and submit</li>
            <li>After January 29th, rooms will be assigned starting with the most expensive</li>
            <li>Ties are settled randomly, and you'll automatically enter selection for next room</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
