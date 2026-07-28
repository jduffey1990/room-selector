import { Link } from 'react-router-dom';
import { Home, PlusCircle, LogIn } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Home className="w-16 h-16 text-indigo-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Room Selector 5000
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Fair, transparent, and democratic room assignment for group trips.
            Create a new trip or join an existing one.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Link
            to="/create"
            className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all border-2 border-transparent hover:border-indigo-300 group"
          >
            <div className="flex items-center justify-center mb-4">
              <PlusCircle className="w-12 h-12 text-indigo-600 group-hover:scale-110 transition-transform" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Create New Trip
            </h2>
            <p className="text-gray-600 text-center">
              Set up a new trip with custom rooms and get codes to share with your group
            </p>
          </Link>

          <Link
            to="/join"
            className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all border-2 border-transparent hover:border-purple-300 group"
          >
            <div className="flex items-center justify-center mb-4">
              <LogIn className="w-12 h-12 text-purple-600 group-hover:scale-110 transition-transform" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Join Existing Trip
            </h2>
            <p className="text-gray-600 text-center">
              Enter your trip code to submit your room preferences
            </p>
          </Link>
        </div>

        <div className="mt-16 max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-md">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">How It Works</h3>
          <ol className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="font-bold text-indigo-600 mr-3">1.</span>
              <span>Trip organizer creates a trip and adds all available rooms</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-indigo-600 mr-3">2.</span>
              <span>Participants enter the trip code and rank their room preferences</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-indigo-600 mr-3">3.</span>
              <span>Organizer runs the allocation algorithm to assign rooms fairly</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-indigo-600 mr-3">4.</span>
              <span>Everyone gets a fair, transparent room assignment</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
