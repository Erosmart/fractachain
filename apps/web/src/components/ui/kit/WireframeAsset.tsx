/**
 * Line-art illustration in the reference's spirit: an isometric slab (a plot
 * of land, a share register — the asset) with rows of tokens on its face and
 * dashed guides down to the ground. Pure SVG in ink tones: decorative.
 */
type Pt = { x: number; y: number };

const L: Pt = { x: 40, y: 150 };
const T: Pt = { x: 330, y: 62 };
const R: Pt = { x: 600, y: 128 };
const B: Pt = { x: 310, y: 222 };
const DEPTH = 44;

const at = (u: number, v: number): Pt => ({
  // Bilinear point on the top face: u along L→T, v along L→B.
  x: L.x + u * (T.x - L.x) + v * (B.x - L.x) + u * v * (R.x - T.x - (B.x - L.x)),
  y: L.y + u * (T.y - L.y) + v * (B.y - L.y) + u * v * (R.y - T.y - (B.y - L.y)),
});
const down = (p: Pt, d = DEPTH): Pt => ({ x: p.x, y: p.y + d });
const pts = (...p: Pt[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

export function WireframeAsset({ className = '' }: { className?: string }) {
  const tokens: Pt[] = [];
  for (let i = 1; i <= 4; i++) for (let j = 1; j <= 3; j++) tokens.push(at(0.14 + i * 0.13, 0.2 + j * 0.16));
  const lens = at(0.78, 0.66);
  return (
    <svg viewBox="0 0 640 330" className={className} fill="none" aria-hidden="true">
      <g stroke="rgb(var(--ink))" strokeLinecap="round" strokeLinejoin="round">
        {/* dashed guides to the ground */}
        {[L, B, R, T].map((p, n) => (
          <line
            key={n}
            x1={p.x}
            y1={p.y + DEPTH}
            x2={p.x}
            y2={330}
            strokeOpacity={0.18}
            strokeDasharray="3 5"
            strokeWidth={1}
          />
        ))}
        <line
          x1={at(0.5, 0.5).x}
          y1={at(0.5, 0.5).y}
          x2={at(0.5, 0.5).x}
          y2={330}
          strokeOpacity={0.12}
          strokeDasharray="3 5"
        />
        {/* body */}
        <polygon
          points={pts(L, B, down(B), down(L))}
          fill="rgb(var(--surface) / 0.55)"
          strokeOpacity={0.5}
          strokeWidth={1.3}
        />
        <polygon
          points={pts(B, R, down(R), down(B))}
          fill="rgb(var(--surface) / 0.35)"
          strokeOpacity={0.5}
          strokeWidth={1.3}
        />
        <polygon
          points={pts(L, T, R, B)}
          fill="rgb(var(--surface) / 0.7)"
          strokeOpacity={0.55}
          strokeWidth={1.4}
        />
        {/* inner bevel */}
        <polygon
          points={pts(at(0.04, 0.06), at(0.96, 0.05), at(0.95, 0.94), at(0.05, 0.95))}
          strokeOpacity={0.16}
          strokeWidth={1}
        />
        {/* tokens */}
        {tokens.map((p, n) => (
          <ellipse key={n} cx={p.x} cy={p.y} rx={9} ry={3.4} strokeOpacity={0.55} strokeWidth={1.2} />
        ))}
        {/* the lens: a tokenized share being read */}
        <ellipse cx={lens.x} cy={lens.y} rx={42} ry={15} strokeOpacity={0.6} strokeWidth={1.3} />
        <ellipse cx={lens.x} cy={lens.y} rx={24} ry={8.5} strokeOpacity={0.25} strokeWidth={1} />
      </g>
    </svg>
  );
}
