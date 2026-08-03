import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, callFn } from '../firebase';
import { auth, sendVerificationLink, readPending, clearPending } from '../auth';
import { CheckCircle2, ChevronDown, ChevronUp, DollarSign, Mail } from 'lucide-react';
import SelectaBot, { BotLoading } from './SelectaBot';

const PRICE_INCREMENT = 25;

export default function SubmissionForm() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [rooms, setRooms] = useState([]);
  
  const [email, setEmail] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [roomPrices, setRoomPrices] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [expandedRoom, setExpandedRoom] = useState(null);

  // Verified identity (P1.1). Until the address is verified there is nothing
  // to submit with: submitPreferences reads the email from the token, so the
  // field below is a claim, not a credential.
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [awaitingLink, setAwaitingLink] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    loadTripData();
  }, [tripId]);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthReady(true);
  }), []);

  // Returning from the emailed link: the bids were stashed before the round
  // trip and are submitted now, so clicking the link is the last step rather
  // than the point where someone has to retype everything.
  useEffect(() => {
    if (!authReady || !user || rooms.length === 0 || resumed.current) return;
    const pending = readPending();
    if (!pending || pending.tripId !== tripId) return;

    resumed.current = true;
    setEmail(user.email || pending.email || '');
    setPartnerEmail(pending.partnerEmail || '');
    setPreferences(pending.preferences || []);
    if (Array.isArray(pending.roomPrices)) {
      const byId = new Map(pending.roomPrices.map((r) => [r.id, r.price]));
      setRoomPrices((prev) =>
        prev.map((r) => (byId.has(r.id) ? { ...r, price: byId.get(r.id) } : r))
      );
    }
    postSubmission({
      preferences: pending.preferences,
      roomPrices: pending.roomPrices,
      partnerEmail: pending.partnerEmail || null,
    });
  }, [authReady, user, rooms, tripId]);

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

  // Posts the submission. The email is deliberately absent from the payload:
  // submitPreferences takes it from the verified token, so there is no field
  // here that could name someone else.
  const postSubmission = async (payload) => {
    setLoading(true);
    try {
      // submitPreferences owns the duplicate-email check and re-validates the
      // zero-sum rule server-side. The client checks are convenience only —
      // they are trivially bypassed with devtools.
      await callFn('submitPreferences', { tripId, ...payload });
      clearPending();
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting:', err);
      clearPending();
      alert(
        err?.code === 'functions/already-exists'
          ? 'This email has already submitted preferences for this trip.'
          : err?.message || 'Failed to submit. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Once signed in, identity comes from the verified token and the local
    // `email` state stays empty — it is only filled on the unverified path.
    // Guarding on `email` alone rejected every signed-in submission with
    // "Please enter your email" while the field visibly showed their address,
    // because the button's own disabled prop already uses `user?.email ||
    // email`. The two must agree or the button enables onto a dead end.
    const effectiveEmail = (user?.email || email).trim();

    if (!effectiveEmail) {
      alert('Please enter your email');
      return;
    }

    if (!effectiveEmail.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    if (preferences.length === 0) {
      alert('Please rank at least one room');
      return;
    }

    // Same reason: comparing against the empty `email` let a signed-in user
    // name themselves as their own partner and slip past this check.
    if (partnerEmail.trim() &&
        partnerEmail.trim().toLowerCase() === effectiveEmail.toLowerCase()) {
      alert('Partner email must be a different person');
      return;
    }

    if (!isBalanced) {
      alert('Price adjustments must sum to zero. Currently: ' + (totalAdjustment > 0 ? '+' : '') + totalAdjustment);
      return;
    }

    const payload = {
      partnerEmail: partnerEmail.toLowerCase().trim() || null,
      preferences,
      roomPrices: roomPrices.map(r => ({ id: r.id, price: r.price })),
    };

    // Already verified (repeat submitter, second trip, same browser): skip
    // the round trip entirely.
    if (user?.email) {
      await postSubmission(payload);
      return;
    }

    setSendingLink(true);
    try {
      await sendVerificationLink(email.toLowerCase().trim(), tripId, payload);
      setAwaitingLink(email.toLowerCase().trim());
    } catch (err) {
      console.error('Error sending verification link:', err);
      alert(
        err?.code === 'auth/invalid-email'
          ? 'That email address does not look valid. Check it and try again.'
          : 'Could not send the verification email. Check the address and try again.'
      );
    } finally {
      setSendingLink(false);
    }
  };

  if (loading) {
    return <BotLoading label="Selecta-bot is fetching the beds…" />;
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

  if (awaitingLink) {
    return (
      <div className="min-h-screen bg-selecta-cream flex items-center justify-center px-4">
        <div className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 p-8 max-w-md text-center">
          <SelectaBot state="thinking" size={96} className="mx-auto mb-4" />
          <h2 className="font-display text-3xl font-bold text-selecta-ink mb-2">
            Check your email
          </h2>
          {/* Plain copy: this is an integrity step, and a person who does not
              understand what to do next is a person who never submits. */}
          <p className="text-selecta-slate mb-4">
            We sent a verification link to <strong>{awaitingLink}</strong>.
            Open it and your preferences are submitted automatically — your
            rankings and prices are saved on this device until then.
          </p>
          <p className="text-sm text-selecta-slate mb-6">
            Verifying your address is what stops anyone else from bidding in
            your name. If the email hasn&rsquo;t arrived in a minute, check
            your spam folder.
          </p>
          <button
            onClick={() => setAwaitingLink('')}
            className="text-selecta-teal hover:underline font-medium"
          >
            ← Use a different email
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-selecta-cream flex items-center justify-center px-4">
        <div className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 p-8 max-w-md text-center">
          <SelectaBot state="done" size={96} className="mx-auto mb-4" />
          <h2 className="font-display text-3xl font-bold text-selecta-ink mb-2">Submitted!</h2>
          <p className="text-selecta-slate mb-6">
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
    // data-ad-free: bid controls and price adjustments. P2.2 forbids ad markup
    // in money or fairness UI. src/ads.js already refuses to load AdSense on
    // this route; this marker is the assertion target for
    // verify/ads-placement.mjs and the CSS selector to paste into AdSense's
    // "Excluded areas" as a second, account-side layer.
    <div className="min-h-screen bg-selecta-cream py-8 px-4" data-ad-free="submission">
      <div className="max-w-4xl mx-auto">
        <div className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 p-6 mb-6">
          <h1 className="font-display text-3xl font-bold text-selecta-ink mb-2">{trip.name}</h1>
          <p className="text-selecta-slate">
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
        <div className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Email
          </label>
          <input
            type="email"
            value={user?.email || email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!user?.email}
            placeholder="your.email@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-600"
          />
          {user?.email ? (
            <p className="text-sm text-green-700 mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Verified — your submission
              is recorded under this address.
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-2">
              We&rsquo;ll email you a link to verify this address before your
              preferences are recorded.
            </p>
          )}

          <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
            I'm sharing a bed with… <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="email"
            value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)}
            placeholder="partner.email@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-sm text-gray-500 mt-2">
            You'll be assigned one bed together and each pay its per-person
            price. This only takes effect if they also submit and enter your
            email here — otherwise you're both allocated as singles.
          </p>
        </div>

        {/* Rooms */}
        <div className="space-y-4 mb-6">
          {rooms.map((room, idx) => {
            const roomPrice = roomPrices.find(r => r.id === room.id);
            const prefIndex = preferences.indexOf(room.id);
            const isRanked = prefIndex !== -1;
            const isExpanded = expandedRoom === room.id;

            return (
              <div key={room.id} data-testid="room-card" className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 overflow-hidden">
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
                          ? 'bg-selecta-teal text-white hover:bg-selecta-teal-dark'
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
        <div className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 p-6">
          <button
            onClick={handleSubmit}
            disabled={
              !isBalanced ||
              !(user?.email || email.trim()) ||
              preferences.length === 0 ||
              sendingLink
            }
            className="w-full bg-selecta-teal text-white px-6 py-4 rounded-lg hover:bg-selecta-teal-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition font-bold text-lg flex items-center justify-center gap-2"
          >
            {sendingLink && <Mail className="w-5 h-5 animate-pulse" />}
            {sendingLink
              ? 'Sending verification link…'
              : user?.email
                ? 'Submit Preferences'
                : 'Verify Email & Submit'}
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
