/**
 * Selecta-bot doing something, for the places that need a picture of a rule
 * rather than a mascot.
 *
 * Separate from SelectaBot.jsx on purpose. That component is a verified
 * head-and-shoulders bust with a four-value `state` prop, rendered on six
 * screens; giving it arms means a new viewBox and re-verifying all of them.
 * These are their own wider canvas and share only the palette.
 *
 * Palette matches SelectaBot.jsx exactly -- chrome body, ink outlines, teal
 * lamp, coral for the thing being pointed at.
 */
const INK = '#26262E';
const BODY = '#B9BFC8';
const FACE = '#E8EAEE';
const SLATE = '#5A5A66';
const TEAL = '#177E71';
const CORAL = '#E2593F';

/** The bot itself, small, so each scene can place it beside its prop. */
function Bot({ x = 0, y = 0, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <line x1="24" y1="2" x2="24" y2="12" stroke={SLATE} strokeWidth="2.5" />
      <circle cx="24" cy="0" r="4" fill={TEAL} />
      <rect x="4" y="12" width="40" height="30" rx="7"
        fill={BODY} stroke={INK} strokeWidth="2.5" />
      <rect x="9" y="16" width="30" height="21" rx="4" fill={FACE} />
      <circle cx="17" cy="25" r="3.5" fill={INK} />
      <circle cx="31" cy="25" r="3.5" fill={INK} />
      <rect x="17" y="31" width="3" height="5" rx="1.5" fill={INK} />
      <rect x="22.5" y="31" width="3" height="5" rx="1.5" fill={INK} />
      <rect x="28" y="31" width="3" height="5" rx="1.5" fill={INK} />
      <rect x="20" y="42" width="8" height="4" fill={SLATE} />
      <rect x="10" y="46" width="28" height="10" rx="5"
        fill={BODY} stroke={INK} strokeWidth="2.5" />
      <circle cx="24" cy="51" r="2.5" fill={TEAL} />
    </g>
  );
}

/** An ordered list, with the top entry called out. */
function RankingScene() {
  return (
    <>
      <Bot x={6} y={30} scale={0.85} />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(66 ${24 + i * 26})`}>
          <rect width="120" height="20" rx="5"
            fill={i === 0 ? '#D8EFEA' : '#FFFFFF'}
            stroke={i === 0 ? TEAL : '#D6D8DE'} strokeWidth={i === 0 ? 2 : 1.5} />
          <text x="10" y="14" fontSize="11" fontWeight="700"
            fill={i === 0 ? TEAL : SLATE} fontFamily="ui-monospace, monospace">
            {i + 1}
          </text>
          <rect x="26" y="7" width={i === 0 ? 74 : 56} height="6" rx="3"
            fill={i === 0 ? TEAL : '#C9CCD3'} />
        </g>
      ))}
    </>
  );
}

/** A level balance: what "adjustments sum to zero" looks like. */
function BalanceScene() {
  return (
    <>
      <Bot x={6} y={30} scale={0.85} />
      {/* stand */}
      <line x1="130" y1="34" x2="130" y2="84" stroke={SLATE} strokeWidth="4" />
      <path d="M112 88 L148 88 L142 80 L118 80 Z" fill={BODY} stroke={INK} strokeWidth="2" />
      {/* beam, deliberately level */}
      <line x1="82" y1="34" x2="178" y2="34" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="130" cy="34" r="5" fill={BODY} stroke={INK} strokeWidth="2" />
      {/* pans, equal height */}
      {[82, 178].map((cx, i) => (
        <g key={cx}>
          <line x1={cx} y1="34" x2={cx} y2="52" stroke={SLATE} strokeWidth="2" />
          <path d={`M${cx - 18} 52 L${cx + 18} 52 L${cx + 12} 64 L${cx - 12} 64 Z`}
            fill={i === 0 ? CORAL : TEAL} stroke={INK} strokeWidth="2" />
          <text x={cx} y="47" fontSize="12" fontWeight="700" textAnchor="middle" fill={INK}>
            {i === 0 ? '+' : '−'}
          </text>
        </g>
      ))}
    </>
  );
}

/** Two beds, one assignment: what confirming a partner produces. */
function PartnersScene() {
  return (
    <>
      <Bot x={6} y={30} scale={0.85} />
      <rect x="68" y="26" width="118" height="62" rx="8"
        fill="none" stroke={TEAL} strokeWidth="2.5" strokeDasharray="6 4" />
      {[78, 134].map((x) => (
        <g key={x}>
          <rect x={x} y="46" width="44" height="26" rx="4"
            fill={FACE} stroke={INK} strokeWidth="2" />
          <rect x={x + 4} y="38" width="16" height="12" rx="3"
            fill={BODY} stroke={INK} strokeWidth="2" />
          <line x1={x} y1="72" x2={x} y2="80" stroke={INK} strokeWidth="2" />
          <line x1={x + 44} y1="72" x2={x + 44} y2="80" stroke={INK} strokeWidth="2" />
        </g>
      ))}
      <circle cx="127" cy="59" r="8" fill={CORAL} stroke={INK} strokeWidth="2" />
      <path d="M123 59 h8 M127 55 v8" stroke="#FFFDF6" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

const SCENES = {
  ranking: { Component: RankingScene, label: 'Selecta-bot beside a ranked list of beds' },
  balance: { Component: BalanceScene, label: 'Selecta-bot beside a balance scale, level' },
  partners: { Component: PartnersScene, label: 'Selecta-bot beside two beds joined as one assignment' },
};

export default function SelectaBotScene({ scene = 'ranking', className = '' }) {
  const { Component, label } = SCENES[scene] || SCENES.ranking;
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label={label}
      className={`w-full max-w-xs ${className}`}>
      <Component />
    </svg>
  );
}
