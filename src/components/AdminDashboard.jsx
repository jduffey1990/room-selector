import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { callFn } from '../firebase';
import { BarChart3, Download, Lock, Loader, AlertCircle, Play } from 'lucide-react';
import { BotLoading } from './SelectaBot';

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

  // P4 lifecycle. `busy` names the in-flight operation so each button can
  // disable itself individually rather than freezing the whole panel.
  const [busy, setBusy] = useState('');
  const [lifecycleError, setLifecycleError] = useState('');

  /**
   * Runs one lifecycle callable and reloads.
   *
   * Everything here mutates a trip other people are relying on, so each caller
   * passes its own confirm() text -- generic "are you sure?" trains people to
   * click through without reading, which is the opposite of what a destructive
   * action needs.
   */
  const lifecycle = async (op, fn, confirmText, extra = {}) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(op);
    setLifecycleError('');
    try {
      const result = await callFn(fn, { tripId, adminCode: adminKey, ...extra });
      await loadData();
      return result;
    } catch (err) {
      console.error(`${fn} failed:`, err);
      setLifecycleError(err?.message || `Could not ${op}. Try again.`);
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async (codeOverride) => {
    // Everything here is gated on the admin code, which getAdminData verifies
    // server-side. Submissions and emails are unreadable by clients, so there
    // is nothing to show until a valid code is supplied.
    const code = codeOverride || searchParams.get('code') || adminKey;
    if (!code) {
      setLoading(false);
      return false;
    }

    try {
      const data = await callFn('getAdminData', { tripId, adminCode: code });
      setTrip(data.trip);
      setRooms(data.rooms);
      setSubmissions(data.submissions);
      setShowEmails(true);
      setError('');
      return true;
    } catch (err) {
      console.error('Error loading data:', err);
      if (err?.code === 'functions/permission-denied') {
        setShowEmails(false);
      } else if (err?.code === 'functions/not-found') {
        setError('Trip not found');
      } else {
        setError('Failed to load trip data');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const checkAdminKey = async () => {
    const ok = await loadData(adminKey.trim());
    if (!ok) alert('Incorrect admin key');
  };

  const runAllocation = async () => {
    if (!showEmails) {
      alert('Please unlock admin access first');
      return;
    }

    if (!confirm('Run allocation now? This will assign rooms and finalize the trip.')) {
      return;
    }

    setAllocating(true);
    setAllocationError('');

    try {
      const result = await callFn('allocateRooms', { tripId, adminCode: adminKey });
      alert(
        `Allocation complete!\n\n${result.assignmentCount} assignments created\n` +
        `${result.coupleCount} couples\n${result.singleCount} singles`
      );
      await loadData();
    } catch (error) {
      console.error('Allocation error:', error);
      const detail = {
        'functions/not-found': 'Cloud function not deployed.',
        'functions/permission-denied': 'Invalid admin code.',
      }[error?.code] || error?.message || 'Please try again.';
      setAllocationError(`Failed to run allocation. ${detail}`);
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
    return <BotLoading label="Selecta-bot is opening the control panel…" />;
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

  // Nothing loads without a valid admin code — getAdminData is the only way to
  // read this trip's submissions. Prompt rather than rendering a null trip.
  if (!trip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Lock className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin access</h2>
          <p className="text-gray-600 mb-6">
            Enter the admin code for this trip to view submissions.
          </p>
          <input
            type="text"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && checkAdminKey()}
            placeholder="ABC123XYZ9"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono tracking-widest mb-4 focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={checkAdminKey}
            disabled={!adminKey.trim()}
            className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            Unlock
          </button>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    // data-ad-free: price balance and the allocation trigger. See src/ads.js.
    <div className="min-h-screen bg-selecta-cream py-8 px-4" data-ad-free="admin">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-display text-3xl font-bold text-selecta-ink">{trip.name}</h1>
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

        {/* Trip lifecycle (P4). Kept below the allocation controls and visually
            quieter: these are the operations an organizer reaches for when
            something went wrong, not the main path. */}
        <div className="bg-selecta-paper border-2 border-selecta-ink/10 rounded-lg p-6 mb-6">
          <h3 className="font-display font-bold text-lg text-selecta-ink mb-1">
            Manage this trip
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Fixing a mistake, or running the allocation again after a change.
          </p>

          <div className="flex flex-wrap gap-3">
            {trip.status === 'collecting' && (
              <button
                onClick={() => lifecycle('close submissions', 'closeSubmissions',
                  'Stop accepting new submissions? Nobody else will be able to submit until you reopen.')}
                disabled={!!busy}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition text-sm"
              >
                {busy === 'close submissions' ? 'Closing…' : 'Close submissions'}
              </button>
            )}

            {(trip.status === 'finalized' || trip.status === 'closed') && (
              <button
                onClick={() => lifecycle('reopen', 'reopenTrip',
                  trip.status === 'finalized'
                    ? 'Reopen this trip? The current results are deleted and everyone can submit again. Their existing submissions are kept.'
                    : 'Reopen this trip so people can submit again?')}
                disabled={!!busy}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition text-sm"
              >
                {busy === 'reopen' ? 'Reopening…' : 'Reopen trip'}
              </button>
            )}

            <button
              onClick={async () => {
                const result = await lifecycle('delete', 'deleteTrip',
                  `Permanently delete "${trip.name}"? This removes the trip, every ` +
                  `submission, the results, and the access codes. It cannot be undone.`);
                if (result?.success) navigate('/');
              }}
              disabled={!!busy}
              className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition text-sm"
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete trip'}
            </button>
          </div>

          {lifecycleError && (
            <p className="text-sm text-red-600 mt-3">{lifecycleError}</p>
          )}

          {submissions.length > 0 && (
            <div className="mt-5 pt-5 border-t border-selecta-ink/10">
              <p className="text-sm font-medium text-selecta-ink mb-2">
                Remove a submission
              </p>
              <p className="text-sm text-gray-600 mb-3">
                For a duplicate, a mistake, or someone who dropped out. If they
                were named as someone's partner, that pairing is cleared too.
              </p>
              <div className="space-y-2">
                {submissions.map((sub) => (
                  <div
                    key={sub.email}
                    className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-gray-800 truncate">{sub.email}</span>
                    <button
                      onClick={() => lifecycle(`remove ${sub.email}`, 'removeSubmission',
                        `Remove ${sub.email}'s submission? They can submit again if the trip is open.`,
                        { email: sub.email })}
                      disabled={!!busy}
                      className="text-sm text-red-700 hover:text-red-900 disabled:opacity-50 shrink-0"
                    >
                      {busy === `remove ${sub.email}` ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                className="w-full bg-selecta-teal text-white px-6 py-3 rounded-lg hover:bg-selecta-teal-dark disabled:bg-gray-400 disabled:cursor-not-allowed transition font-bold flex items-center justify-center gap-2"
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
              {submissions.map((sub, idx) => {
                // A couple only forms when both submissions name each other.
                const partnerSub = sub.partnerEmail
                  ? submissions.find(s => s.email === sub.partnerEmail)
                  : null;
                const partnerConfirmed =
                  partnerSub && partnerSub.partnerEmail === sub.email;
                return (
                <div key={sub.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {showEmails ? sub.email : `Participant #${idx + 1}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(sub.timestamp).toLocaleString()}
                      </p>
                      {sub.partnerEmail && showEmails && (
                        <p className={`text-sm mt-1 ${partnerConfirmed ? 'text-purple-700' : 'text-amber-700'}`}>
                          {partnerConfirmed
                            ? `Sharing a bed with ${sub.partnerEmail} (confirmed)`
                            : `Wants to share a bed with ${sub.partnerEmail} — not confirmed by them; both will be allocated as singles`}
                        </p>
                      )}
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
                );
              })}
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