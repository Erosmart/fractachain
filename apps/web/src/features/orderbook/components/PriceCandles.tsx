import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { buildCandles } from '../model';

interface PriceCandlesProps {
  trades: { price: number; amount?: number; createdAt: string }[];
  refPrice: number;
}

/** Japanese candlestick chart of recent trades with volume bars (inline SVG). */
export default function PriceCandles({ trades, refPrice }: PriceCandlesProps) {
  const { t, locale } = useI18n();
  const candles = useMemo(() => buildCandles(trades, refPrice), [trades, refPrice]);

  const W = 600;
  const H = 190;
  const PADL = 4;
  const PADR = 46;
  const PADT = 8;
  const PADB = 16;
  const VOLH = 20;
  const plotW = W - PADL - PADR;
  const priceH = H - PADT - PADB - VOLH - 4;
  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const range = Math.max(hi - lo, 0.01);
  const maxV = Math.max(...candles.map((c) => c.v), 1);
  const bw = plotW / candles.length;
  const y = (p: number) => PADT + (1 - (p - lo) / range) * priceH;
  const first = candles[0];
  const last = candles[candles.length - 1];
  const up = last.c >= first.o;
  const loc = locale === 'en' ? 'en-US' : 'es-AR';
  const daySpan = last.t - first.t > 20 * 3600e3;
  const timeFmt = (ts: number) =>
    new Date(ts).toLocaleString(loc, daySpan ? { day: '2-digit', month: '2-digit' } : { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-3">
      <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
        <span className="uppercase tracking-wider font-lcd">{t('ob.trend')}</span>
        <span className={`font-mono font-bold ${up ? 'text-[#3f8f38]' : 'text-red-600'}`}>
          {up ? '▲' : '▼'} ${last.c.toFixed(2)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44" role="img" aria-label={t('ob.trend')}>
        {/* grid horizontal + etiquetas de precio */}
        {Array.from({ length: 5 }, (_, i) => {
          const p = lo + (range * i) / 4;
          const yy = y(p);
          return (
            <g key={i}>
              <line x1={PADL} x2={W - PADR} y1={yy} y2={yy} stroke="#000" strokeOpacity={0.07} strokeDasharray="3 4" />
              <text x={W - PADR + 5} y={yy + 3} fontSize={8.5} fill="#000" fillOpacity={0.45} fontFamily="monospace">
                {p.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* volumen + velas */}
        {candles.map((c, i) => {
          const x = PADL + i * bw + bw / 2;
          const col = c.c >= c.o ? '#3f8f38' : '#dc2626';
          const body = Math.max(1.2, Math.abs(y(c.o) - y(c.c)));
          const top = Math.min(y(c.o), y(c.c));
          const vh = (c.v / maxV) * VOLH;
          return (
            <g key={i}>
              {vh > 0 && <rect x={x - bw * 0.32} y={H - PADB - vh} width={Math.max(1.5, bw * 0.64)} height={vh} fill={col} opacity={0.25} />}
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.1} />
              <rect x={x - bw * 0.32} y={top} width={Math.max(1.5, bw * 0.64)} height={body} fill={col} rx={0.5} />
            </g>
          );
        })}
        {/* línea de último precio */}
        <line x1={PADL} x2={W - PADR} y1={y(last.c)} y2={y(last.c)} stroke="#111" strokeOpacity={0.5} strokeDasharray="2 3" />
        <rect x={W - PADR + 1} y={y(last.c) - 7} width={PADR - 3} height={13} rx={3} fill="#111" />
        <text x={W - PADR + 5} y={y(last.c) + 3} fontSize={8.5} fill="#fff" fontFamily="monospace">
          {last.c.toFixed(2)}
        </text>
        {/* eje de tiempo */}
        {[0, 0.33, 0.66, 1].map((f) => {
          const i = Math.min(candles.length - 1, Math.round(f * (candles.length - 1)));
          return (
            <text
              key={f}
              x={Math.min(Math.max(PADL + i * bw + bw / 2, PADL + 14), W - PADR - 14)}
              y={H - 4}
              fontSize={8}
              fill="#000"
              fillOpacity={0.4}
              fontFamily="monospace"
              textAnchor="middle"
            >
              {timeFmt(candles[i].t)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
