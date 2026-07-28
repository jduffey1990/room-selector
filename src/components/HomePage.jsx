import { Link } from 'react-router-dom';
import { PlusCircle, LogIn } from 'lucide-react';
import SelectaBot from './SelectaBot';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-selecta-cream">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <SelectaBot state="idle" size={112} />
          </div>
          <p className="font-display tracking-[0.3em] text-selecta-coral text-sm font-semibold uppercase mb-2">
            Selecta-bot presents
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-selecta-ink tracking-wide mb-4 uppercase">
            Room Selector 5000
          </h1>
          <p className="text-lg sm:text-xl text-selecta-slate max-w-2xl mx-auto">
            A fairer way for a group to divide up beds — and what everyone
            pays — without anyone feeling outbid.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Link
            to="/create"
            className="bg-selecta-paper rounded-2xl p-8 shadow-selecta border-2 border-selecta-ink/10 hover:border-selecta-teal transition-all group"
          >
            <div className="flex items-center justify-center mb-4">
              <PlusCircle className="w-12 h-12 text-selecta-teal group-hover:scale-110 transition-transform" />
            </div>
            <h2 className="font-display text-2xl font-bold text-selecta-ink mb-2 text-center">
              Create a Trip
            </h2>
            <p className="text-selecta-slate text-center">
              List the beds and the total cost, then share one link with your
              group
            </p>
          </Link>

          <Link
            to="/join"
            className="bg-selecta-paper rounded-2xl p-8 shadow-selecta border-2 border-selecta-ink/10 hover:border-selecta-coral transition-all group"
          >
            <div className="flex items-center justify-center mb-4">
              <LogIn className="w-12 h-12 text-selecta-coral group-hover:scale-110 transition-transform" />
            </div>
            <h2 className="font-display text-2xl font-bold text-selecta-ink mb-2 text-center">
              Join a Trip
            </h2>
            <p className="text-selecta-slate text-center">
              Enter your trip code, rank the beds you'd accept, and nudge
              their prices
            </p>
          </Link>
        </div>

        <div className="mt-12 sm:mt-16 max-w-2xl mx-auto bg-selecta-paper rounded-xl p-8 shadow-selecta border-2 border-selecta-ink/10">
          <h3 className="font-display text-2xl font-bold text-selecta-ink mb-4">How It Works</h3>
          <ol className="space-y-3 text-selecta-ink">
            <li className="flex items-start">
              <span className="font-bold text-selecta-teal mr-3">1.</span>
              <span>One person creates the trip and lists the beds</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-selecta-teal mr-3">2.</span>
              <span>Everyone ranks the beds they'd genuinely accept and nudges prices up or down (adjustments sum to zero)</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-selecta-teal mr-3">3.</span>
              <span>The organizer runs the allocation</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-selecta-teal mr-3">4.</span>
              <span>Beds and prices are set so that nobody prefers anyone else's bed at its price, judged by their own numbers</span>
            </li>
          </ol>
          <p className="mt-4 text-sm text-selecta-slate">
            So "I got outbid" has an answer: you were offered that bed at that
            price, and you preferred the money.
          </p>
        </div>
      </div>
    </div>
  );
}
