import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, callFn } from '../firebase';
import { Trophy, Users, DollarSign, AlertCircle, Home } from 'lucide-react';
import SelectaBot, { BotLoading } from './SelectaBot';

export default function ResultsView() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [needsCode, setNeedsCode] = useState(false);

  useEffect(() => {
    loadResults();
  }, [tripId]);

  const loadResults = async (codeOverride) => {
    setLoading(true);
    try {
      // The trip document stays publicly readable, so the name and status can
      // render before anyone supplies a code.
      const tripDoc = await getDoc(doc(db, 'trips', tripId));
      if (!tripDoc.exists()) {
        setError('Trip not found');
        return;
      }

      const tripData = { id: tripDoc.id, ...tripDoc.data() };
      setTrip(tripData);

      if (tripData.status !== 'finalized') {
        setError('Results not yet available. Trip organizer needs to run allocation first.');
        return;
      }

      // Assignments carry everyone's email, so they are gated behind a code.
      const supplied = codeOverride || code;
      if (!supplied) {
        setNeedsCode(true);
        return;
      }

      const data = await callFn('getResults', { tripId, code: supplied });
      const sorted = [...data.assignments].sort(
        (a, b) => b.totalPerPerson - a.totalPerPerson
      );
      setAssignments(sorted);
      setNeedsCode(false);
      setError('');
    } catch (err) {
      console.error('Error loading results:', err);
      if (err?.code === 'functions/permission-denied') {
        setNeedsCode(true);
        setError('That code did not match this trip.');
      } else {
        setError('Failed to load results');
      }
    } finally {
      setLoading(false);
    }
  };

  // Derived from the loaded assignments. This was referenced by the JSX below
  // but never computed, which crashed the component on its first successful
  // render — results had never actually been viewable in production.
  const stats = assignments.length > 0 ? (() => {
    const totalPeople = assignments.reduce((n, a) => n + a.emails.length, 0);
    const avgAdjustment = assignments.reduce(
      (sum, a) => sum + a.priceAdjustment * a.emails.length, 0
    ) / totalPeople;
    const prices = assignments.map(a => a.totalPerPerson);
    return {
      totalPeople,
      avgAdjustment,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      uniqueBedClasses: new Set(assignments.map(a => a.bedClass)).size,
    };
  })() : null;

  if (needsCode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Trophy className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {trip?.name || 'Trip results'}
          </h2>
          <p className="text-gray-600 mb-6">
            Enter your trip code to see who got which bed.
          </p>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC12345"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono tracking-widest mb-4 focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => loadResults(code.trim())}
            disabled={!code.trim()}
            className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            View Results
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <BotLoading label="Selecta-bot is retrieving the assignments…" />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Results Not Available</h2>
          <p className="text-gray-600 mb-4">{error}</p>
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
    <div className="min-h-screen bg-selecta-cream py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 p-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <SelectaBot state="done" size={56} className="flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-bold text-selecta-ink">{trip.name}</h1>
                <p className="text-selecta-slate">Final Room Assignments</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
            >
              <Home className="w-5 h-5" />
              Home
            </button>
          </div>
          
          {trip.finalizedAt && (
            <p className="text-sm text-gray-500">
              {/* finalizedAt is a Firestore Timestamp when read via getDoc */}
              Finalized: {(trip.finalizedAt.toDate
                ? trip.finalizedAt.toDate()
                : new Date(trip.finalizedAt)).toLocaleString()}
            </p>
          )}
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <p className="text-sm text-gray-600">Total People</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPeople}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                <p className="text-sm text-gray-600">Avg Adjustment</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.avgAdjustment >= 0 ? '+' : ''}${stats.avgAdjustment.toFixed(2)}
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-blue-600" />
                <p className="text-sm text-gray-600">Price Range</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.priceRange.min.toFixed(0)} - ${stats.priceRange.max.toFixed(0)}
              </p>
            </div>
            
            <div className="bg-white rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <Home className="w-5 h-5 text-purple-600" />
                <p className="text-sm text-gray-600">Room Types</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.uniqueBedClasses}</p>
            </div>
          </div>
        )}

        {/* Assignments List */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Room Assignments</h2>
          
          {assignments.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No assignments yet</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment, idx) => {
                const isCouple = assignment.emails.length > 1;
                const adjustmentColor = assignment.priceAdjustment >= 0 
                  ? 'text-green-700 bg-green-50' 
                  : 'text-red-700 bg-red-50';
                
                return (
                  <div 
                    key={assignment.id} 
                    className="border-2 border-gray-200 rounded-xl p-5 hover:shadow-md transition-all"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {isCouple && <Users className="w-5 h-5 text-purple-600 flex-shrink-0" />}
                          <h3 className="font-bold text-lg text-gray-900 break-words min-w-0">
                            {assignment.emails.join(' + ')}
                          </h3>
                        </div>
                        <p className="text-gray-700">
                          <span className="font-medium">Room:</span> {assignment.roomNames}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className="font-medium">Type:</span> {assignment.bedClass}
                        </p>
                      </div>
                      
                      <div className="text-left sm:text-right sm:ml-4 flex-shrink-0">
                        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${adjustmentColor} mb-1`}>
                          {assignment.priceAdjustment >= 0 ? '+' : '-'}${Math.abs(assignment.priceAdjustment).toFixed(2)}
                        </div>
                        <p className="text-sm text-gray-600">
                          Total: <span className="font-bold">${assignment.totalPerPerson.toFixed(2)}</span>/person
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress bar showing relative price */}
                    {stats && (
                      <div className="mt-3">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-400 to-indigo-500"
                            style={{
                              width: `${stats.priceRange.max > stats.priceRange.min
                                ? ((assignment.totalPerPerson - stats.priceRange.min) /
                                   (stats.priceRange.max - stats.priceRange.min)) * 100
                                : 100}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Explanation */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 mb-2">💡 How Pricing Works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Trip total: ${Number(trip.totalTripCost || 0).toLocaleString()}, split across everyone</li>
            <li>• All adjustments sum to $0 (zero-sum system)</li>
            <li>• Prices are set so nobody prefers anyone else's bed at its price, judged by their own submitted numbers</li>
            <li>• If someone else got the bed you wanted, you were offered it at this price and your numbers preferred the money</li>
          </ul>
        </div>
      </div>
    </div>
  );
}