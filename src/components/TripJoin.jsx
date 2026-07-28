import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { LogIn, AlertCircle } from 'lucide-react';

export default function TripJoin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const joinTrip = async (e) => {
    e.preventDefault();
    
    if (!code.trim()) {
      setError('Please enter a trip code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Search for trip with matching participant code
      const tripsRef = collection(db, 'trips');
      const q = query(tripsRef, where('participantCode', '==', code.trim().toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Invalid trip code. Please check and try again.');
        setLoading(false);
        return;
      }

      const tripDoc = snapshot.docs[0];
      const tripId = tripDoc.id;

      // Navigate to submission form for this trip
      navigate(`/trip/${tripId}`);
    } catch (err) {
      console.error('Error joining trip:', err);
      setError('Failed to join trip. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-10 h-10 text-purple-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Join a Trip</h1>
            <p className="text-gray-600">
              Enter the trip code shared by your organizer
            </p>
          </div>

          <form onSubmit={joinTrip} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trip Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="ABC12345"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-center font-mono text-lg tracking-wider uppercase"
                maxLength={12}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
            >
              {loading ? 'Joining...' : 'Join Trip'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-purple-600 hover:text-purple-800 font-medium"
            >
              ← Back to Home
            </button>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">💡 Don't have a code?</h3>
          <p className="text-sm text-blue-700">
            Ask your trip organizer to share the participant link or trip code with you.
            If you're the organizer, go back and create a new trip instead.
          </p>
        </div>
      </div>
    </div>
  );
}
