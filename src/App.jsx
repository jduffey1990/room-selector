import { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import TripCreator from './components/TripCreator';
import TripJoin from './components/TripJoin';
import SubmissionForm from './components/SubmissionForm';
import AdminDashboard from './components/AdminDashboard';
import ResultsView from './components/ResultsView';
import SelectaBot, { BotLoading } from './components/SelectaBot';
import { isReturningFromLink, completeSignIn } from './auth';

function App() {
  // Firebase appends its parameters to the site root, so a returning
  // verification link arrives before any route matches. Completing sign-in
  // here -- with the Router unmounted -- means the Router reads the corrected
  // hash on its first render instead of navigating twice.
  const [linkState, setLinkState] = useState(() =>
    isReturningFromLink() ? 'completing' : 'idle'
  );
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    if (linkState !== 'completing') return;
    let cancelled = false;

    (async () => {
      try {
        const pending = await completeSignIn();
        if (cancelled) return;
        const target = pending?.tripId ? `/#/trip/${pending.tripId}` : '/#/';
        window.history.replaceState({}, '', target);
        setLinkState('idle');
      } catch (err) {
        if (cancelled) return;
        console.error('Verification link failed:', err);
        // Plain and actionable: the two real causes are an expired link and
        // one already used, and the fix for both is to submit again.
        setLinkError(
          err?.code === 'auth/invalid-action-code'
            ? 'That verification link has expired or was already used. Open the trip link again and resubmit to get a fresh one.'
            : err?.message || 'That verification link could not be completed.'
        );
        setLinkState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkState]);

  if (linkState === 'completing') {
    return <BotLoading label="Selecta-bot is checking your verification link…" />;
  }

  if (linkState === 'error') {
    return (
      <div className="min-h-screen bg-selecta-cream flex items-center justify-center px-4">
        <div className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 p-8 max-w-md text-center">
          <SelectaBot state="warning" size={96} className="mx-auto mb-4" />
          <h2 className="font-display text-2xl font-bold text-selecta-ink mb-2">
            Verification didn&rsquo;t go through
          </h2>
          <p className="text-selecta-slate mb-6">{linkError}</p>
          <a href="/#/" className="text-selecta-teal hover:underline font-medium">
            ← Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<TripCreator />} />
        <Route path="/join" element={<TripJoin />} />
        <Route path="/trip/:tripId" element={<SubmissionForm />} />
        <Route path="/admin/:tripId" element={<AdminDashboard />} />
        <Route path="/results/:tripId" element={<ResultsView />} />
      </Routes>
    </Router>
  );
}

export default App;
