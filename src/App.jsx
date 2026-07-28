import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import TripCreator from './components/TripCreator';
import TripJoin from './components/TripJoin';
import SubmissionForm from './components/SubmissionForm';
import AdminDashboard from './components/AdminDashboard';
import ResultsView from './components/ResultsView';

function App() {
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