/**
 * Selecta-bot: the 1950s robot who helps groups democratize where they
 * sleep. Inline SVG so it costs nothing to load and can be tinted by state.
 *
 * States: idle (neutral), thinking (antenna pulses, used for loading),
 * done (content), warning (brass lamp, flat mouth — for empty/attention
 * states only, never for money or errors, which stay plain text).
 */
/**
 * Full-screen loading state. Retro flourish is allowed here — loading copy
 * is exactly where the voice guide says it belongs.
 */
export function BotLoading({ label = 'Selecta-bot is warming its tubes…' }) {
  return (
    <div className="min-h-screen bg-selecta-cream flex items-center justify-center">
      <div className="text-center">
        <SelectaBot state="thinking" size={96} className="mx-auto mb-4" />
        <p className="text-selecta-slate">{label}</p>
      </div>
    </div>
  );
}

export default function SelectaBot({ state = 'idle', size = 96, className = '' }) {
  const lamp = {
    idle: '#177E71',
    thinking: '#E2593F',
    done: '#177E71',
    warning: '#C98A1B',
  }[state] || '#177E71';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`Selecta-bot (${state})`}
      className={className}
    >
      {/* antenna */}
      <line x1="48" y1="14" x2="48" y2="26" stroke="#5A5A66" strokeWidth="3" />
      <circle
        cx="48" cy="10" r="5"
        fill={lamp}
        className={state === 'thinking' ? 'animate-pulse' : ''}
      />

      {/* head */}
      <rect x="18" y="26" width="60" height="44" rx="10"
        fill="#B9BFC8" stroke="#26262E" strokeWidth="2.5" />
      <rect x="24" y="32" width="48" height="32" rx="6" fill="#E8EAEE" />

      {/* rivets */}
      <circle cx="23" cy="31" r="1.6" fill="#5A5A66" />
      <circle cx="73" cy="31" r="1.6" fill="#5A5A66" />
      <circle cx="23" cy="65" r="1.6" fill="#5A5A66" />
      <circle cx="73" cy="65" r="1.6" fill="#5A5A66" />

      {/* eyes */}
      {state === 'done' ? (
        <>
          {/* content: arcs */}
          <path d="M 31 46 q 5 -6 10 0" stroke="#26262E" strokeWidth="3"
            fill="none" strokeLinecap="round" />
          <path d="M 55 46 q 5 -6 10 0" stroke="#26262E" strokeWidth="3"
            fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="36" cy="45" r="5.5" fill="#26262E" />
          <circle cx="60" cy="45" r="5.5" fill="#26262E" />
          <circle cx="38" cy="43" r="1.8" fill="#FFFDF6" />
          <circle cx="62" cy="43" r="1.8" fill="#FFFDF6" />
        </>
      )}

      {/* mouth: speaker grille, or a flat line when warning */}
      {state === 'warning' ? (
        <line x1="40" y1="57" x2="56" y2="57" stroke="#26262E"
          strokeWidth="3" strokeLinecap="round" />
      ) : (
        <>
          <rect x="38" y="53" width="4" height="8" rx="2" fill="#26262E" />
          <rect x="46" y="53" width="4" height="8" rx="2" fill="#26262E" />
          <rect x="54" y="53" width="4" height="8" rx="2" fill="#26262E" />
        </>
      )}

      {/* neck + shoulders */}
      <rect x="42" y="70" width="12" height="6" fill="#5A5A66" />
      <rect x="26" y="76" width="44" height="14" rx="7"
        fill="#B9BFC8" stroke="#26262E" strokeWidth="2.5" />
      <circle cx="48" cy="83" r="4" fill={lamp} />
    </svg>
  );
}
