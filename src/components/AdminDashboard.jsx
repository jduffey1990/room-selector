import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import { BarChart3, Download, Lock, Unlock, Loader, AlertCircle, Play } from 'lucide-react';

export default function AdminDashboard() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [showEmails, setShowEmails] = useState(false);
  const [adminKey, setAdminKey] = useState(searchParams.get('code') || '');
  const [error, setError] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [allocationError, setAllocationError] = useState('');

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
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

      // Auto-unlock if code in URL matches
      if (searchParams.get('code') === tripData.adminCode) {
        setShowEmails(true);
      }

      // Load rooms
      const roomsRef = collection(db, 'rooms');
      const roomsQuery = query(roomsRef, where('tripId', '==', tripId));
      const roomsSnapshot = await getDocs(roomsQuery);
      const roomsData = roomsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRooms(roomsData);

      // Load submissions
      const subsRef = collection(db, 'submissions');
      const subsQuery = query(subsRef, where('tripId', '==', tripId));
      const subsSnapshot = await getDocs(subsQuery);
      const subsData = subsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSubmissions(subsData);
      
      setLoading(false);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load trip data');
      setLoading(false);
    }
  };

  const checkAdminKey = () => {
    if (adminKey === trip.adminCode) {
      setShowEmails(true);
    } else {
      alert('Incorrect admin key');
    }
  };

  const runAllocation = async () => {
    if (!adminKey || adminKey !== trip.adminCode) {
      alert('Please unlock admin access first');
      return;
    }

    if (!confirm('Run allocation now? This will assign rooms and finalize the trip.')) {
      return;
    }

    setAllocating(true);
    setAllocationError('');

    try {
      const functions = getFunctions();
      const allocateRooms = httpsCallable(functions, 'allocateRooms');
      
      const result = await allocateRooms({
        tripId: tripId,
        adminCode: adminKey
      });

      if (result.data.success) {
        alert(`✅ Allocation complete!\n\n${result.data.assignmentCount} assignments created\n${result.data.coupleCount} couples\n${result.data.singleCount} singles`);
        
        // Reload data to show updated status
        await loadData();
      }
    } catch (error) {
      console.error('Allocation error:', error);
      let errorMessage = 'Failed to run allocation. ';
      
      if (error.code === 'functions/not-found') {
        errorMessage += 'Cloud function not deployed. See setup instructions.';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage += 'Invalid admin code.';
      } else if (error.code === 'functions/failed-precondition') {
        errorMessage += error.message;
      } else {
        errorMessage += error.message || 'Please try again.';
      }
      
      setAllocationError(errorMessage);
    } finally {
      setAllocating(false);
    }
  };

  const exportToCSV = () => {
    if (!showEmails) {
      alert('Please unlock admin access first');
      return;
    }

    let csv = 'email,timestamp,ranked_rooms,price_adjustments,total_adjustment\n';
    
    submissions.forEach(sub => {
      const rankedRooms = sub.preferences.map(prefId => {
        const room = sub.roomPrices.find(r => r.id === prefId);
        return room ? room.name : prefId;
      }).join(';');
      
      const adjustments = sub.roomPrices
        .filter(r => r.price !== r.basePrice)
        .map(r => `${r.name}:${r.price}`)
        .join(';');
      
      csv += `"${sub.email}","${sub.timestamp}","${rankedRooms}","${adjustments}",${sub.totalAdjustment}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/\s+/g, '-')}-submissions.csv`;
    a.click();
  };

  const exportToJSON = () => {
    if (!showEmails) {
      alert('Please unlock admin access first');
      return;
    }

    const data = {
      trip: {
        id: trip.id,
        name: trip.name,
        totalTripCost: trip.totalTripCost,
        createdAt: trip.createdAt
      },
      rooms,
      submissions: submissions.map(sub => ({
        email: sub.email,
        timestamp: sub.timestamp,
        preferences: sub.preferences,
        roomPrices: sub.roomPrices,
        totalAdjustment: sub.totalAdjustment
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trip.name.replace(/\s+/g, '-')}-submissions.json`;
    a.click();
  };

  // Calculate stats
  const stats = {
    totalSubmissions: submissions.length,
    balancedSubmissions: submissions.filter(s => s.totalAdjustment === 0).length,
    roomPopularity: rooms.map(room => ({
      name: room.name,
      firstChoices: submissions.filter(s => s.preferences[0] === room.id).length,
      anyRank: submissions.filter(s => s.preferences.includes(room.id)).length
    }))
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{trip.name}</h1>
            <button
              onClick={() => navigate('/')}
              className="text-indigo-600 hover:text-indigo-800"
            >
              ← Home
            </button>
          </div>
          <p className="text-gray-600">Admin Dashboard</p>
          
          {/* Trip Status */}
          <div className="mt-4 flex items-center gap-3">
            <span className={`px-4 py-2 rounded-full text-sm font-medium ${
              trip.status === 'finalized' 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {trip.status === 'finalized' ? '✓ Finalized' : '⏳ Collecting Submissions'}
            </span>
            
            {trip.status === 'finalized' && (
              <button
                onClick={() => navigate(`/results/${tripId}`)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition font-medium"
              >
                View Results
              </button>
            )}
          </div>
        </div>

        {/* Allocation Section */}
        {trip.status !== 'finalized' && submissions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-2">🎯 Ready to Allocate Rooms?</h3>
            <p className="text-sm text-blue-800 mb-4">
              {submissions.length} {submissions.length === 1 ? 'person has' : 'people have'} submitted preferences. 
              {showEmails 
                ? ' Click below to run the allocation algorithm.' 
                : ' Unlock admin access to run allocation.'}
            </p>
            
            {allocationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800">{allocationError}</p>
              </div>
            )}
            
            {showEmails && (
              <button
                onClick={runAllocation}
                disabled={allocating}
                className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-bold flex items-center justify-center gap-2"
              >
                {allocating ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Running Allocation...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Run Room Allocation
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-8 h-8 text-indigo-600" />
              <div>
                <p className="text-sm text-gray-600">Total Submissions</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalSubmissions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-bold">✓</span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Balanced Submissions</p>
                <p className="text-3xl font-bold text-gray-900">{stats.balancedSubmissions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-bold">#</span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Rooms</p>
                <p className="text-3xl font-bold text-gray-900">{rooms.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Room Popularity */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Room Popularity</h2>
          <div className="space-y-3">
            {stats.roomPopularity
              .sort((a, b) => b.firstChoices - a.firstChoices)
              .map((room, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-gray-700">{room.name}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-indigo-600 font-medium">
                      {room.firstChoices} first choice{room.firstChoices !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-500">
                      {room.anyRank} total ranking{room.anyRank !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Admin Access Control */}
        {!showEmails && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-900 mb-1">Submissions are protected</p>
                <p className="text-sm text-yellow-700">
                  Enter your admin code to view emails and export data
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && checkAdminKey()}
                placeholder="Enter admin code"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
              />
              <button
                onClick={checkAdminKey}
                className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 transition"
              >
                Unlock
              </button>
            </div>
          </div>
        )}

        {/* Export Buttons */}
        {showEmails && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
            <button
              onClick={exportToJSON}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              <Download className="w-5 h-5" />
              Export JSON
            </button>
          </div>
        )}

        {/* Submissions List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Submissions</h2>
          
          {submissions.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No submissions yet</p>
          ) : (
            <div className="space-y-4">
              {submissions.map((sub, idx) => (
                <div key={sub.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {showEmails ? sub.email : `Participant #${idx + 1}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(sub.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      sub.totalAdjustment === 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {sub.totalAdjustment === 0 ? 'Balanced' : `${sub.totalAdjustment > 0 ? '+' : ''}$${sub.totalAdjustment}`}
                    </span>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Room Preferences:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {sub.preferences.slice(0, 5).map((prefId, i) => {
                        const room = sub.roomPrices.find(r => r.id === prefId);
                        return (
                          <li key={i} className="text-sm text-gray-600">
                            {room?.name || prefId} ({room?.price >= 0 ? '+' : ''}${room?.price}/person)
                          </li>
                        );
                      })}
                    </ol>
                    {sub.preferences.length > 5 && (
                      <p className="text-sm text-gray-500 mt-1">
                        + {sub.preferences.length - 5} more rooms
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participant Link */}
        <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-6">
          <h3 className="font-semibold text-indigo-900 mb-2">Share with participants:</h3>
          <code className="block bg-white px-4 py-2 rounded text-sm break-all">
            {window.location.origin}{window.location.pathname}#/trip/{tripId}
          </code>
        </div>
      </div>
    </div>
  );
}