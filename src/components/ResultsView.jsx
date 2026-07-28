import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Users, DollarSign, Loader, AlertCircle, Home } from 'lucide-react';

export default function ResultsView() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadResults();
  }, [tripId]);

  const loadResults = async () => {
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
      
      // Check if finalized
      if (tripData.status !== 'finalized') {
        setError('Results not yet available. Trip organizer needs to run allocation first.');
        setLoading(false);
        return;
      }

      // Load assignments
      const assignmentsRef = collection(db, 'assignments');
      const q = query(assignmentsRef, where('tripId', '==', tripId));
      const assignmentsSnapshot = await getDocs(q);
      const assignmentsData = assignmentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Sort by total price (most expensive first)
      assignmentsData.sort((a, b) => b.totalPerPerson - a.totalPerPerson);
      
      setAssignments(assignmentsData);
      setLoading(false);
    } catch (err) {
      console.error('Error loading results:', err);
      setError('Failed to load results');
      setLoading(false);
    }
  };

  // Calculate stats
  const stats = assignments.length > 0 ? {
    totalPeople: assignments.reduce((sum, a) => sum + a.emails.length, 0),
    avgAdjustment: assignments.reduce((sum, a) => sum + a.priceAdjustment * a.emails.length, 0) / 
                    assignments.reduce((sum, a) => sum + a.emails.length, 0),
    uniqueBedClasses: [...new Set(assignments.map(a => a.bedClass))].length,
    priceRange: {
      min: Math.min(...assignments.map(a => a.totalPerPerson)),
      max: Math.max(...assignments.map(a => a.totalPerPerson))
    }
  } : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-10 h-10 text-yellow-500" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{trip.name}</h1>
                <p className="text-gray-600">Final Room Assignments</p>
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
              Finalized: {new Date(trip.finalizedAt).toLocaleString()}
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
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {isCouple && <Users className="w-5 h-5 text-purple-600" />}
                          <h3 className="font-bold text-lg text-gray-900">
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
                      
                      <div className="text-right ml-4">
                        <div className={`px-4 py-2 rounded-lg font-bold text-lg ${adjustmentColor} mb-1`}>
                          {assignment.priceAdjustment >= 0 ? '+' : ''}${assignment.priceAdjustment.toFixed(2)}
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
                              width: `${((assignment.totalPerPerson - stats.priceRange.min) / 
                                       (stats.priceRange.max - stats.priceRange.min)) * 100}%`
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
            <li>• Price adjustments reflect room quality and preferences</li>
            <li>• All adjustments sum to $0 (zero-sum system)</li>
            <li>• Identical room types have identical prices</li>
          </ul>
        </div>
      </div>
    </div>
  );
}