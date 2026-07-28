import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { PlusCircle, Trash2, Copy, Check } from 'lucide-react';

function generateCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function TripCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Trip details, 2: Add rooms, 3: Success
  const [loading, setLoading] = useState(false);
  
  // Trip details
  const [tripName, setTripName] = useState('');
  const [baseCost, setBaseCost] = useState(480);
  
  // Rooms
  const [rooms, setRooms] = useState([
    { name: '', description: '', basePrice: 0, capacity: 1, type: 'king' }
  ]);
  
  // Generated codes
  const [tripId, setTripId] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [participantCode, setParticipantCode] = useState('');
  const [copiedAdmin, setCopiedAdmin] = useState(false);
  const [copiedParticipant, setCopiedParticipant] = useState(false);

  const addRoom = () => {
    setRooms([...rooms, { name: '', description: '', basePrice: 0, capacity: 1, type: 'other' }]);
  };

  const removeRoom = (index) => {
    setRooms(rooms.filter((_, i) => i !== index));
  };

  const updateRoom = (index, field, value) => {
    const updated = [...rooms];
    updated[index][field] = value;
    setRooms(updated);
  };

  const createTrip = async () => {
    // Validation
    if (!tripName.trim()) {
      alert('Please enter a trip name');
      return;
    }
    if (rooms.length === 0) {
      alert('Please add at least one room');
      return;
    }
    if (rooms.some(r => !r.name.trim())) {
      alert('Please fill in all room names');
      return;
    }

    setLoading(true);
    try {
      const admin = generateCode(10);
      const participant = generateCode(8);

      // Create trip document
      const tripRef = await addDoc(collection(db, 'trips'), {
        name: tripName,
        baseCostPerPerson: baseCost,
        adminCode: admin,
        participantCode: participant,
        status: 'collecting',
        createdAt: new Date().toISOString(),
      });

      // Create room documents in batch
      const batch = writeBatch(db);
      rooms.forEach((room) => {
        const roomRef = doc(collection(db, 'rooms'));
        batch.set(roomRef, {
          tripId: tripRef.id,
          name: room.name,
          description: room.description,
          basePrice: parseFloat(room.basePrice) || 0,
          capacity: parseInt(room.capacity) || 1,
          type: room.type,
          note: `$${baseCost + (parseFloat(room.basePrice) || 0)}/person total`,
        });
      });
      await batch.commit();

      setTripId(tripRef.id);
      setAdminCode(admin);
      setParticipantCode(participant);
      setStep(3);
    } catch (error) {
      console.error('Error creating trip:', error);
      alert('Failed to create trip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'admin') {
        setCopiedAdmin(true);
        setTimeout(() => setCopiedAdmin(false), 2000);
      } else {
        setCopiedParticipant(true);
        setTimeout(() => setCopiedParticipant(false), 2000);
      }
    } catch (err) {
      alert('Failed to copy to clipboard');
    }
  };

  if (step === 3) {
    const participantUrl = `${window.location.origin}${window.location.pathname}#/trip/${tripId}`;
    const adminUrl = `${window.location.origin}${window.location.pathname}#/admin/${tripId}`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Trip Created!</h2>
              <p className="text-gray-600">Your trip "{tripName}" is ready</p>
            </div>

            <div className="space-y-6">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <h3 className="font-bold text-lg text-purple-900 mb-2">🔐 Admin Access</h3>
                <p className="text-sm text-purple-700 mb-3">Use this to view submissions and manage the trip</p>
                <div className="bg-white rounded-lg p-3 font-mono text-lg text-center mb-2 border-2 border-purple-300">
                  {adminCode}
                </div>
                <button
                  onClick={() => copyToClipboard(adminCode, 'admin')}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2"
                >
                  {copiedAdmin ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedAdmin ? 'Copied!' : 'Copy Admin Code'}
                </button>
                <button
                  onClick={() => {
                    navigate(`/admin/${tripId}?code=${adminCode}`);
                  }}
                  className="w-full mt-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 transition"
                >
                  Go to Admin Dashboard
                </button>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6">
                <h3 className="font-bold text-lg text-indigo-900 mb-2">👥 Participant Link</h3>
                <p className="text-sm text-indigo-700 mb-3">Share this with your group</p>
                <div className="bg-white rounded-lg p-3 text-sm break-all mb-2 border-2 border-indigo-300">
                  {participantUrl}
                </div>
                <button
                  onClick={() => copyToClipboard(participantUrl, 'participant')}
                  className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  {copiedParticipant ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedParticipant ? 'Copied!' : 'Copy Participant Link'}
                </button>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Trip Details:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Base cost: ${baseCost}/person</li>
                  <li>• Total rooms: {rooms.length}</li>
                  <li>• Trip ID: {tripId}</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={() => navigate('/')}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                ← Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Trip</h1>
          <p className="text-gray-600 mb-8">
            {step === 1 ? 'Enter trip details' : 'Add rooms and pricing'}
          </p>

          {/* Progress indicator */}
          <div className="flex items-center mb-8">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'} font-bold`}>
              1
            </div>
            <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-200'}`} />
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'} font-bold`}>
              2
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trip Name *
                </label>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g., Vail 2026"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Cost Per Person ($) *
                </label>
                <input
                  type="number"
                  value={baseCost}
                  onChange={(e) => setBaseCost(e.target.value)}
                  placeholder="480"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  This is the base amount everyone has already paid
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!tripName.trim()}
                  className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  Next: Add Rooms
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-4">
                {rooms.map((room, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 relative">
                    {rooms.length > 1 && (
                      <button
                        onClick={() => removeRoom(index)}
                        className="absolute top-2 right-2 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Room Name *
                        </label>
                        <input
                          type="text"
                          value={room.name}
                          onChange={(e) => updateRoom(index, 'name', e.target.value)}
                          placeholder="e.g., Primary King Suite"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Type
                        </label>
                        <select
                          value={room.type}
                          onChange={(e) => updateRoom(index, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="king">King Bed</option>
                          <option value="queen">Queen Bed</option>
                          <option value="full">Full Bed</option>
                          <option value="twin">Twin Bed</option>
                          <option value="bunk">Bunk Bed</option>
                          <option value="floor">Floor Spot</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={room.description}
                        onChange={(e) => updateRoom(index, 'description', e.target.value)}
                        placeholder="e.g., Attached bathroom, fireplace"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Price Adjustment ($)
                        </label>
                        <input
                          type="number"
                          value={room.basePrice}
                          onChange={(e) => updateRoom(index, 'basePrice', e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Total: ${baseCost + (parseFloat(room.basePrice) || 0)}/person
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Capacity
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={room.capacity}
                          onChange={(e) => updateRoom(index, 'capacity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addRoom}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 hover:border-indigo-400 hover:bg-indigo-50 transition flex items-center justify-center gap-2 text-gray-600 hover:text-indigo-600"
              >
                <PlusCircle className="w-5 h-5" />
                Add Another Room
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Back
                </button>
                <button
                  onClick={createTrip}
                  disabled={loading || rooms.length === 0 || rooms.some(r => !r.name.trim())}
                  className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  {loading ? 'Creating...' : 'Create Trip'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
