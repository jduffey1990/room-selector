import { useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './components/HomePage';
import TripCreator from './components/TripCreator';
import TripJoin from './components/TripJoin';
import SubmissionForm from './components/SubmissionForm';
import AdminDashboard from './components/AdminDashboard';
import ResultsView from './components/ResultsView';
import SelectaBot, { BotLoading } from './components/SelectaBot';
import Footer from './components/Footer';
import { PrivacyPolicy, Terms } from './components/LegalPages';
import { isReturningFromLink, completeSignIn } from './auth';
import { syncAds } from './ads';

// Loads (or refuses to load) AdSense per route. Renders nothing -- the whole
// job is deciding whether ad code is allowed to exist on the current page.
// See src/ads.js for why this, rather than account settings, is the guarantee.
function AdsGate() {
  const { pathname } = useLocation();
  useEffect(() => {
    syncAds(pathname);
  }, [pathname]);
  return null;
}

function App() {
  // Firebase appends its parameters to the site root, so a returning
  // verification link arrives before any route matches. Completing sign-in
  // here -- with the Router unmounted -- means the Router reads the corrected
  // hash on its first render instead of navigating twice.
  const [linkState, setLinkState] = useState(() =>
    isReturningFromLink() ? 'completing' : 'idle'
  );
  const [linkError, setLinkError] = useState('');

  // A sign-in code is single-use, so completing it must happen exactly once.
  // StrictMode double-invokes effects in development, and the second call was
  // consuming an already-spent code: the first sign-in succeeded and the user
  // was then shown "that link has expired". A cancellation flag does not help
  // -- it suppresses the state update, not the second network call.
  const completing = useRef(false);

  useEffect(() => {
    if (linkState !== 'completing' || completing.current) return;
    completing.current = true;

    // No cancellation flag here on purpose. StrictMode runs the cleanup
    // between its two invocations, so a flag would discard the result of the
    // one real sign-in and leave the spinner up forever. The ref above is what
    // guarantees exactly-once; the outcome is always worth applying.
    (async () => {
      try {
        const pending = await completeSignIn();
        const target = pending?.tripId ? `/#/trip/${pending.tripId}` : '/#/';
        window.history.replaceState({}, '', target);
        setLinkState('idle');
      } catch (err) {
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
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
      {/* Outside <Routes> so the legal links are reachable from every page --
          both a legal requirement and an AdSense approval requirement. */}
      <Footer />
      <AdsGate />
    </Router>
  );
}

export default App;
