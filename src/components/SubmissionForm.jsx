import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, callFn } from '../firebase';
import { BarChart3, CheckCircle2, ChevronDown, ChevronUp, DollarSign, Loader } from 'lucide-react';

const PRICE_INCREMENT = 25;

export default function SubmissionForm() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [rooms, setRooms] = useState([]);
  
  const [email, setEmail] = useState('');
  const [roomPrices, setRoomPrices] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [expandedRoom, setExpandedRoom] = useState(null);

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  const loadTripData = async () => {
    try {
      // Load trip
      const tripDoc = await getDoc(doc(db, 'trips', tripId));
      if (!tripDoc.exists()) {
        setError('Trip not found');
        setLoading(false);
        return;
      }
      
      const tripData = { id: tripDoc.id, ...tripDoc.data() };
      setTrip(tripData);

      // Load rooms
      const roomsRef = collection(db, 'rooms');
      const q = query(roomsRef, where('tripId', '==', tripId));
      const roomsSnapshot = await getDocs(q);
      // Firestore returns documents in arbitrary order, which reads as random
      // shuffling to a participant. Sort best-to-worst so the list has an
      // obvious shape.
      const roomsData = roomsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));

      setRooms(roomsData);
      setRoomPrices(roomsData.map(r => ({ ...r, price: r.basePrice })));
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading trip:', err);
      setError('Failed to load trip data');
      setLoading(false);
    }
  };

  const adjustPrice = (roomId, amount) => {
    setRoomPrices(prev =>
      prev.map(r => r.id === roomId ? { ...r, price: r.price + amount } : r)
    );
  };

  // Mirrors TripCreator: the trip stores a total, and the per-person share is
  // derived from how many people the beds sleep.
  const tripCapacity = rooms.reduce(
    (sum, r) => sum + (parseInt(r.capacity, 10) || 1), 0
  );
  const tripPerPerson = tripCapacity > 0 && Number(trip?.totalTripCost) > 0
    ? Number(trip.totalTripCost) / tripCapacity
    : 0;

  const totalAdjustment = roomPrices.reduce((sum, room) => {
    const original = rooms.find(r => r.id === room.id);
    return sum + (room.price - original.basePrice);
  }, 0);

  const isBalanced = totalAdjustment === 0;

  const togglePreference = (roomId) => {
    setPreferences(prev => {
      if (prev.includes(roomId)) {
        return prev.filter(id => id !== roomId);
      } else {
        return [...prev, roomId];
      }
    });
  };

  const movePreference = (fromIndex, toIndex) => {
    const newPrefs = [...preferences];
    const [moved] = newPrefs.splice(fromIndex, 1);
    newPrefs.splice(toIndex, 0, moved);
    setPreferences(newPrefs);
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      alert('Please enter your email');
      return;
    }

    if (!email.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    if (preferences.length === 0) {
      alert('Please rank at least one room');
      return;
    }

    if (!isBalanced) {
      alert('Price adjustments must sum to zero. Currently: ' + (totalAdjustment > 0 ? '+' : '') + totalAdjustment);
      return;
    }

    setLoading(true);
    try {
      // submitPreferences owns the duplicate-email check and re-validates the
      // zero-sum rule server-side. The client checks above are convenience
      // only — they are trivially bypassed with devtools.
      await callFn('submitPreferences', {
        tripId,
        email: email.toLowerCase().trim(),
        preferences,
        roomPrices: roomPrices.map(r => ({ id: r.id, price: r.price })),
      });

      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting:', err);
      alert(
        err?.code === 'functions/already-exists'
          ? 'This email has already submitted preferences for this trip.'
          : err?.message || 'Failed to submit. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading trip...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <CheckCircle2 className="w-20 h-20 text-green-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Submitted!</h2>
          <p className="text-gray-600 mb-6">
            Your room preferences for <strong>{trip.name}</strong> have been recorded.
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{trip.name}</h1>
          <p className="text-gray-600">
            ${Number(trip.totalTripCost || 0).toLocaleString()} total • about $
            {tripPerPerson.toFixed(2)}/person before bed adjustments •{' '}
            {rooms.length} beds
          </p>
        </div>

        {/* Balance Indicator */}
        <div className={`sticky top-4 z-10 mb-6 p-4 rounded-lg shadow-md ${
          isBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className={`w-6 h-6 ${isBalanced ? 'text-green-600' : 'text-red-600'}`} />
              <div>
                <p className="font-semibold text-gray-900">Price Balance</p>
                <p className="text-sm text-gray-600">
                  {isBalanced ? 'Perfect! Your adjustments sum to zero.' : `Needs adjustment: ${totalAdjustment > 0 ? '+' : ''}$${totalAdjustment}`}
                </p>
              </div>
            </div>
            {isBalanced && <CheckCircle2 className="w-6 h-6 text-green-600" />}
          </div>
        </div>

        {/* Email Input */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Rooms */}
        <div className="space-y-4 mb-6">
          {rooms.map((room, idx) => {
            const roomPrice = roomPrices.find(r => r.id === room.id);
            const prefIndex = preferences.indexOf(room.id);
            const isRanked = prefIndex !== -1;
            const isExpanded = expandedRoom === room.id;

            return (
              <div key={room.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                      <p className="text-sm text-gray-600">{room.description}</p>
                      {/* Computed at render. This used to be a `note` string
                          baked in at trip creation, which froze the number. */}
                      <p className="text-sm text-gray-500 mt-1">
                        ${(tripPerPerson + (room.basePrice || 0)).toFixed(2)}/person total
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-2xl font-bold text-indigo-600">
                        {roomPrice.price >= 0 ? '+' : ''}{roomPrice.price}
                      </p>
                      <p className="text-sm text-gray-500">/person</p>
                    </div>
                  </div>

                  {/* Ranking */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => togglePreference(room.id)}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                        isRanked
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isRanked ? `Ranked #${prefIndex + 1}` : 'Add to Preferences'}
                    </button>
                    
                    {isRanked && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => movePreference(prefIndex, Math.max(0, prefIndex - 1))}
                          disabled={prefIndex === 0}
                          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => movePreference(prefIndex, Math.min(preferences.length - 1, prefIndex + 1))}
                          disabled={prefIndex === preferences.length - 1}
                          className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Price Adjustment */}
                  <button
                    onClick={() => setExpandedRoom(isExpanded ? null : room.id)}
                    className="w-full text-left text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    {isExpanded ? '− Hide' : '+ Show'} Price Adjustment
                  </button>

                  {isExpanded && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700 mb-3">
                        Adjust this room's price:
                      </p>
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => adjustPrice(room.id, -PRICE_INCREMENT)}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-bold"
                        >
                          -${PRICE_INCREMENT}
                        </button>
                        <span className="font-mono text-xl font-bold">
                          {roomPrice.price >= 0 ? '+' : ''}{roomPrice.price}
                        </span>
                        <button
                          onClick={() => adjustPrice(room.id, PRICE_INCREMENT)}
                          className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-bold"
                        >
                          +${PRICE_INCREMENT}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <button
            onClick={handleSubmit}
            disabled={!isBalanced || !email.trim() || preferences.length === 0}
            className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-bold text-lg"
          >
            Submit Preferences
          </button>
          {!isBalanced && (
            <p className="text-sm text-red-600 mt-2 text-center">
              Price adjustments must balance to $0
            </p>
          )}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
