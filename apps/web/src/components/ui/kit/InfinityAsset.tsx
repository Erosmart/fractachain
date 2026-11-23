import { useId } from 'react';

/**
 * The Fractachain infinity, animated: a Bernoulli lemniscate (the logo's
 * loop, crossing at the centre) in the brand gradient blue → teal → green, a
 * diagonal orbit behind it and tokens travelling the curve. Ported from the
 * v1 landing; colours come from the `--fc-*` tokens so it follows the theme.
 * Decorative only.
 *
 * Works both as static HTML (Astro without a client directive) and inside
 * React islands. Each instance gets its own SVG ids, so several can share a
 * page.
 *
 * Motion: the dash drift and float are CSS (off under reduced motion); the
 * travelling particles are SMIL, which ignores that media query, so their
 * group is hidden there instead (`.fc-particles` in global.css).
 */
const INFINITY =
  'M580,160 L578.9,173.6 L575.8,186.7 L570.7,199.2 L563.8,210.7 L555.4,220.9 L545.7,229.8 L535.1,237.1 L523.8,242.9 L512.1,247.2 L500.1,250.1 L488.2,251.6 L476.3,251.9 L464.7,251.1 L453.5,249.3 L442.6,246.7 L432.1,243.3 L422,239.3 L412.4,234.7 L403.1,229.7 L394.3,224.3 L385.8,218.6 L377.6,212.7 L369.8,206.5 L362.2,200.1 L354.8,193.6 L347.6,187 L340.6,180.3 L333.7,173.6 L326.8,166.8 L320,160 L313.2,153.2 L306.3,146.4 L299.4,139.7 L292.4,133 L285.2,126.4 L277.8,119.9 L270.2,113.5 L262.4,107.3 L254.2,101.4 L245.7,95.7 L236.9,90.3 L227.6,85.3 L218,80.7 L207.9,76.7 L197.4,73.3 L186.5,70.7 L175.3,68.9 L163.7,68.1 L151.8,68.4 L139.9,69.9 L127.9,72.8 L116.2,77.1 L104.9,82.9 L94.3,90.2 L84.6,99.1 L76.2,109.3 L69.3,120.8 L64.2,133.3 L61.1,146.4 L60,160 L61.1,173.6 L64.2,186.7 L69.3,199.2 L76.2,210.7 L84.6,220.9 L94.3,229.8 L104.9,237.1 L116.2,242.9 L127.9,247.2 L139.9,250.1 L151.8,251.6 L163.7,251.9 L175.3,251.1 L186.5,249.3 L197.4,246.7 L207.9,243.3 L218,239.3 L227.6,234.7 L236.9,229.7 L245.7,224.3 L254.2,218.6 L262.4,212.7 L270.2,206.5 L277.8,200.1 L285.2,193.6 L292.4,187 L299.4,180.3 L306.3,173.6 L313.2,166.8 L320,160 L326.8,153.2 L333.7,146.4 L340.6,139.7 L347.6,133 L354.8,126.4 L362.2,119.9 L369.8,113.5 L377.6,107.3 L385.8,101.4 L394.3,95.7 L403.1,90.3 L412.4,85.3 L422,80.7 L432.1,76.7 L442.6,73.3 L453.5,70.7 L464.7,68.9 L476.3,68.1 L488.2,68.4 L500.1,69.9 L512.1,72.8 L523.8,77.1 L535.1,82.9 L545.7,90.2 L555.4,99.1 L563.8,109.3 L570.7,120.8 L575.8,133.3 L578.9,146.4 Z';

const ORBIT = 'M 75.5 274.1 A 270 60 -25 1 0 564.7 45.9 A 270 60 -25 1 0 75.5 274.1';

const c = (token: string, alpha = 1) => `rgb(var(--fc-${token}) / ${alpha})`;

/** Tokens travelling the curves: [radius, colour, alpha, duration s, begin s, path]. */
const PARTICLES: [number, string, number, number, number, string][] = [
  [4, 'green', 0.5, 9, -6, INFINITY],
  [4, 'green', 0.5, 9, -3, INFINITY],
  [4, 'green', 0.5, 9, 0, INFINITY],
  [3, 'teal', 0.45, 12, -4, INFINITY],
  [3, 'teal', 0.45, 12, -9, INFINITY],
  [3, 'gold', 0.5, 14, -7, INFINITY],
  [3.5, 'blue', 0.45, 13, -4, ORBIT],
  [3, 'green', 0.45, 16, -10, ORBIT],
];

export function InfinityAsset({ className = '' }: { className?: string }) {
  const uid = `fc-inf-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const inf = `${uid}-inf`;
  const band = `${uid}-band`;
  const glow = `${uid}-glow`;

  return (
    <div aria-hidden="true" className={`pointer-events-none overflow-hidden ${className}`}>
      <svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" className="h-full w-full" fill="none">
        <defs>
          <linearGradient id={inf} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: c('blue') }} />
            <stop offset="50%" style={{ stopColor: c('teal') }} />
            <stop offset="100%" style={{ stopColor: c('green') }} />
          </linearGradient>
          <linearGradient id={band} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: c('blue') }} />
            <stop offset="55%" style={{ stopColor: c('teal') }} />
            <stop offset="100%" style={{ stopColor: c('green') }} />
          </linearGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
        </defs>

        {/* Diagonal orbit behind, as in the logo */}
        <g className="fc-float">
          <path d={ORBIT} stroke={`url(#${band})`} strokeWidth="12" opacity="0.07" />
          <path
            d={ORBIT}
            stroke={`url(#${band})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="46 18"
            opacity="0.09"
            className="fc-drift-rev"
          />
        </g>

        {/* The infinity: a glowing ribbon, a dashed ribbon drifting, a gold thread, a moving glint */}
        <g className="fc-float">
          <path
            d={INFINITY}
            style={{ stroke: c('teal') }}
            strokeWidth="46"
            strokeLinecap="round"
            opacity="0.045"
            filter={`url(#${glow})`}
          />
          <path d={INFINITY} stroke={`url(#${inf})`} strokeWidth="30" strokeLinecap="round" opacity="0.1" />
          <path
            d={INFINITY}
            stroke={`url(#${inf})`}
            strokeWidth="30"
            strokeLinecap="round"
            strokeDasharray="46 18"
            opacity="0.15"
            className="fc-drift"
          />
          <path
            d={INFINITY}
            style={{ stroke: c('gold') }}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="110 18 110 18"
            opacity="0.26"
            className="fc-drift-rev"
          />
          <path
            d={INFINITY}
            stroke="#ffffff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="60 196"
            opacity="0.18"
            className="fc-drift"
          />
        </g>

        {/* Nodes at the tips of the lobes and the crossing, like the logo */}
        <circle cx="60" cy="160" r="7" style={{ fill: c('blue', 0.45) }} />
        <circle cx="42" cy="138" r="3.5" style={{ fill: c('blue', 0.32) }} />
        <circle cx="46" cy="184" r="3" style={{ fill: c('blue', 0.3) }} />
        <circle cx="580" cy="160" r="7" style={{ fill: c('green', 0.45) }} />
        <circle cx="600" cy="140" r="3.5" style={{ fill: c('green', 0.32) }} />
        <circle cx="604" cy="182" r="3" style={{ fill: c('green', 0.3) }} />
        <circle cx="320" cy="160" r="5" style={{ fill: c('teal', 0.45) }} />
        <circle cx="452" cy="120" r="6" style={{ fill: c('gold', 0.45) }} />

        <g className="fc-particles">
          {PARTICLES.map(([r, tone, alpha, dur, begin, path], i) => (
            <circle key={i} r={r} style={{ fill: c(tone, alpha) }}>
              <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} />
            </circle>
          ))}
        </g>

        {/* Ambient glow and scattered marks */}
        <circle cx="92" cy="248" r="36" style={{ fill: c('blue', 0.07) }} filter={`url(#${glow})`} />
        <circle cx="556" cy="76" r="44" style={{ fill: c('green', 0.07) }} filter={`url(#${glow})`} />
        <g className="fc-float" style={{ fill: c('green', 0.3) }}>
          <circle cx="90" cy="48" r="2.4" />
          <circle cx="556" cy="52" r="3" />
          <circle cx="48" cy="264" r="2.8" />
          <circle cx="592" cy="272" r="2.2" />
          <circle cx="320" cy="26" r="2" />
        </g>
        <g style={{ stroke: c('green', 0.16) }} strokeWidth="1">
          <circle cx="140" cy="70" r="14" />
          <circle cx="505" cy="255" r="18" />
          <circle cx="70" cy="200" r="9" />
          <circle cx="600" cy="110" r="22" strokeDasharray="3 5" />
        </g>
        <g style={{ stroke: c('green', 0.24) }} strokeWidth="1.4" strokeLinecap="round">
          <path d="M40 96v10M35 101h10" />
          <path d="M604 210v10M599 215h10" />
          <path d="M210 286v8M206 290h8" />
        </g>
      </svg>
    </div>
  );
}
