import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import SelectaBotScene from './SelectaBotScene';

export const HOW_IT_WORKS_KEY = 'rs5000.howItWorks.v1';

/**
 * The explainer that used to not exist.
 *
 * The submission form asks people to do two things that are not
 * self-evident -- rank beds honestly, and make price adjustments that cancel
 * out -- and explained neither. Envy-freeness is the whole product, and the
 * page that depends on people understanding it said nothing about it.
 *
 * Voice: this is about money and fairness, so it is literal throughout. The
 * retro flourish stays in the heading.
 *
 * Hard constraint, from the P5 note in CLAUDE.md: this must explain how the
 * mechanism works, never how to come out ahead in it. The mechanism is not
 * strategyproof, so copy that taught people to shade their bids would break
 * the exact property being sold. "Say what things are worth to you" is the
 * message; "here is how to get the good room cheap" is not.
 */
const STEPS = [
  {
    scene: 'ranking',
    title: 'Rank the beds you would actually take',
    body: (
      <>
        Put them in the order you genuinely prefer. If there is a bed you would
        not accept at any price, leave it off the list — that is a real answer,
        not a tactic.
      </>
    ),
  },
  {
    scene: 'balance',
    title: 'Say what each bed is worth to you',
    body: (
      <>
        Nudge a bed&rsquo;s price up if it is worth more to you than an even
        split, or down if it is worth less. You are describing value, not
        placing a bid against anyone.
      </>
    ),
  },
  {
    scene: 'partners',
    title: 'Your adjustments have to cancel out',
    body: (
      <>
        Every dollar you add to one bed has to come off another, so your
        numbers always total the even split. That is why nobody can simply
        raise the whole board: you are only ever saying which beds are worth
        more <em>relative to each other</em>.
      </>
    ),
  },
];

export default function HowItWorks({ onClose }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      // Send focus back where it came from, or a keyboard user is dropped at
      // the top of the document with no idea where they are.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-selecta-ink/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="how-it-works-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hiw-title"
        tabIndex={-1}
        data-testid="how-it-works"
        className="bg-selecta-paper rounded-2xl shadow-selecta border-2 border-selecta-ink/10 w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-start justify-between p-6 pb-2">
          <h2 id="hiw-title" className="font-display text-2xl font-bold text-selecta-ink">
            How this works
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 rounded p-1 focus:outline-none focus:ring-2 focus:ring-selecta-teal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 space-y-6">
          {STEPS.map((step) => (
            <div key={step.scene} className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <SelectaBotScene scene={step.scene} className="sm:w-40 shrink-0" />
              <div>
                <h3 className="font-semibold text-selecta-ink mb-1">{step.title}</h3>
                <p className="text-sm text-selecta-slate leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}

          {/* The payoff. Stated plainly because it is the reason any of the
              above is worth a participant's patience. */}
          <div className="bg-selecta-teal-light border border-selecta-teal/30 rounded-lg p-4">
            <p className="text-sm text-selecta-teal-dark leading-relaxed">
              Selecta-bot then assigns beds and sets prices so that{' '}
              <strong>nobody would rather have someone else&rsquo;s bed at its
              price</strong>. That is what makes the result defensible if
              anyone asks — and ranking honestly is what makes it true.
            </p>
          </div>
        </div>

        <div className="p-6 pt-4">
          <button
            type="button"
            onClick={onClose}
            data-testid="how-it-works-dismiss"
            className="w-full bg-selecta-teal text-white px-6 py-3 rounded-lg hover:bg-selecta-teal-dark transition font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
