import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { callFn } from '../firebase';
import { AlertCircle } from 'lucide-react';
import SelectaBot from './SelectaBot';

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
      // Codes are no longer queryable from the client — joinTrip resolves the
      // code server-side against a collection nothing can read.
      const { tripId } = await callFn('joinTrip', {
        participantCode: code.trim().toUpperCase(),
      });
      navigate(`/trip/${tripId}`);
    } catch (err) {
      console.error('Error joining trip:', err);
      setError(
        err?.code === 'functions/not-found'
          ? 'Invalid trip code. Please check and try again.'
          : 'Failed to join trip. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-selecta-cream py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 p-8">
          <div className="text-center mb-8">
            <SelectaBot state="idle" size={80} className="mx-auto mb-4" />
            <h1 className="font-display text-3xl font-bold text-selecta-ink mb-2">Join a Trip</h1>
            <p className="text-selecta-slate">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-selecta-teal text-center font-mono text-lg tracking-wider uppercase"
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
              className="w-full bg-selecta-coral text-white px-6 py-3 rounded-lg hover:bg-selecta-coral-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
            >
              {loading ? 'Joining...' : 'Join Trip'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-selecta-teal hover:text-selecta-teal-dark font-medium"
            >
              ← Back to Home
            </button>
          </div>
        </div>

        <div className="mt-6 bg-selecta-teal-light border border-selecta-teal/30 rounded-lg p-4">
          <h3 className="font-semibold text-selecta-teal-dark mb-2">Don't have a code?</h3>
          <p className="text-sm text-selecta-teal-dark">
            Ask your trip organizer to share the participant link or trip code with you.
            If you're the organizer, go back and create a new trip instead.
          </p>
        </div>
      </div>
    </div>
  );
}
