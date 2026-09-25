import { CheckCircle2 } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

const CX = 200;
const CY = 190;
const R = 148;
const STEP = 13;

// Coarse continent outlines in viewBox space (400x380), circle center 200/190.
const CONTINENTS: [number, number][][] = [
  // South America
  [[98, 190], [112, 168], [135, 158], [162, 166], [168, 180], [158, 205], [148, 240], [136, 272], [124, 288], [116, 262], [104, 222], [96, 200]],
  // North America
  [[52, 98], [82, 72], [118, 60], [152, 66], [168, 82], [150, 96], [128, 104], [98, 112], [70, 110]],
  // Europe
  [[255, 82], [282, 70], [308, 78], [302, 98], [278, 108], [258, 98]],
  // Africa
  [[250, 124], [288, 114], [320, 138], [318, 184], [292, 218], [274, 212], [258, 172], [246, 142]],
  // Asia (partial, clipped by the rim on purpose)
  [[318, 72], [344, 86], [352, 112], [334, 132], [312, 116], [310, 92]],
];

// ~Argentina, inside the South America outline
const HUB: [number, number] = [125, 272];

// Arcs arriving at Argentina from all over the globe
const ARCS: { from: [number, number]; c: [number, number]; dur: number; delay: number }[] = [
  { from: [70, 96], c: [8, 170], dur: 2.7, delay: 0.0 },    // North America (west)
  { from: [150, 72], c: [80, 20], dur: 3.3, delay: 0.7 },   // North America (east)
  { from: [164, 170], c: [205, 225], dur: 2.2, delay: 1.9 },// Brazil
  { from: [272, 90], c: [195, 30], dur: 3.6, delay: 1.2 },  // Europe
  { from: [292, 96], c: [250, 150], dur: 2.9, delay: 0.4 }, // Southern Europe / N. Africa
  { from: [282, 190], c: [225, 262], dur: 2.5, delay: 1.6 },// Africa
  { from: [340, 96], c: [310, 10], dur: 4.2, delay: 0.9 },  // Asia
  { from: [56, 160], c: [-20, 230], dur: 3.5, delay: 2.3 }, // Pacific
];

function insidePoly(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const DOTS: { x: number; y: number; land: boolean }[] = [];
for (let x = CX - R; x <= CX + R; x += STEP) {
  for (let y = CY - R; y <= CY + R; y += STEP) {
    const dx = x - CX;
    const dy = y - CY;
    if (dx * dx + dy * dy > R * R) continue;
    DOTS.push({ x, y, land: CONTINENTS.some((p) => insidePoly(x, y, p)) });
  }
}

export default function MoreThanRwaSection() {
  const messages = getServerMessages();
  const copy = messages.home.moreRwa;

  return (
    <section className="relative crystal-card rounded-2xl sm:rounded-3xl overflow-hidden min-h-[26rem] sm:min-h-[30rem] lg:min-h-[32rem]">
      {/* Globe as a large background element anchored to the side */}
      <div
        className="globe-float pointer-events-none absolute inset-y-0 -right-16 sm:-right-24 lg:-right-32 w-[90%] sm:w-[70%] lg:w-[62%] opacity-30 sm:opacity-50 lg:opacity-75"
        aria-hidden="true"
      >
        <svg viewBox="0 0 400 380" className="h-full w-full" preserveAspectRatio="xMaxYMid slice">
          <defs>
            <clipPath id="mtrGlobeClip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
            <radialGradient id="mtrOcean" cx="0.35" cy="0.3" r="1">
              <stop offset="0%" stopColor="#f4fbee" />
              <stop offset="100%" stopColor="#e4f3d8" />
            </radialGradient>
          </defs>

          <circle cx={CX} cy={CY} r={R} fill="url(#mtrOcean)" stroke="rgba(60,110,45,0.22)" strokeWidth="1" />

          <g clipPath="url(#mtrGlobeClip)">
            {DOTS.map((d, i) =>
              d.land ? (
                <circle key={i} cx={d.x} cy={d.y} r={2} fill="#3f8f37" opacity={0.85} />
              ) : (
                <circle key={i} cx={d.x} cy={d.y} r={1.2} fill="#64748b" opacity={0.18} />
              )
            )}
            {[112, 150, 230, 268].map((y) => (
              <line key={y} x1={CX - R} y1={y} x2={CX + R} y2={y} stroke="rgba(60,110,45,0.14)" strokeWidth="0.8" />
            ))}
            <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="rgba(60,110,45,0.2)" strokeWidth="0.8" />
            <ellipse cx={CX} cy={CY} rx={70} ry={R} fill="none" stroke="rgba(60,110,45,0.14)" strokeWidth="0.8" />
            <ellipse cx={CX} cy={CY} rx={120} ry={R} fill="none" stroke="rgba(60,110,45,0.1)" strokeWidth="0.8" />
          </g>

          {ARCS.map((a, i) => {
            const d = `M${a.from[0]},${a.from[1]} Q${a.c[0]},${a.c[1]} ${HUB[0]},${HUB[1]}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="rgba(78,167,67,0.4)" strokeWidth="1.2" strokeDasharray="3 4" />
                <circle r={2.6} fill="#2f7d29">
                  <animateMotion dur={`${a.dur}s`} begin={`${a.delay}s`} repeatCount="indefinite" path={d} />
                </circle>
                <circle cx={a.from[0]} cy={a.from[1]} r={2.2} fill="#2f7d29" opacity={0.7} />
                <circle cx={a.from[0]} cy={a.from[1]} r={2.2} fill="#4ea743" opacity={0.5}>
                  <animate attributeName="r" values="2.2;8;2.2" dur={`${a.dur}s`} begin={`${a.delay}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur={`${a.dur}s`} begin={`${a.delay}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}

          {/* Argentina hub — everything lands here */}
          <circle cx={HUB[0]} cy={HUB[1]} r={3.8} fill="#1f5c1a" />
          <circle cx={HUB[0]} cy={HUB[1]} r={3.8} fill="#4ea743" opacity={0.6}>
            <animate attributeName="r" values="3.8;15;3.8" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Copy over the globe */}
      <div className="relative z-10 flex min-h-[26rem] sm:min-h-[30rem] lg:min-h-[32rem] items-center p-6 sm:p-10 lg:p-14">
        <div className="max-w-lg space-y-5">
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{copy.kicker}</p>
          <h2 className="font-section text-3xl sm:text-4xl lg:text-5xl font-extrabold text-black">{copy.title}</h2>
          <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">{copy.body}</p>
          <ul className="flex flex-wrap gap-2.5 pt-1">
            {copy.points.map((point) => (
              <li
                key={point}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/70 border border-black/10 text-xs font-display font-bold text-black"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#4ea743] shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
