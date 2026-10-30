import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { money, qty } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import { buildCandles, type Candle } from '../model';

interface PriceCandlesProps {
  trades: { price: number; amount?: number; createdAt: string }[];
  refPrice: number;
  code: string;
}

const H_PRICE = 176;
const H_GAP = 10;
const H_VOL = 34;
const H = H_PRICE + H_GAP + H_VOL;
const PAD_R = 58;
const PAD_T = 8;

/** "Nice" tick step (1, 2, 2.5, 5 × 10ⁿ) for about `count` intervals. */
function niceTicks(lo: number, hi: number, count = 3): number[] {
  const raw = Math.max((hi - lo) / count, 1e-9);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Candlestick chart of recent trades with volume below (inline SVG, sized to
 * its container so text stays crisp). Up candles are hollow and down candles
 * filled, so direction never rests on color alone; periods without trades
 * are a faint dash. Crosshair + tooltip on hover, ←/→ on keyboard, and a
 * table view with every period that traded.
 */
export default function PriceCandles({ trades, refPrice, code }: PriceCandlesProps) {
  const { t, locale } = useI18n();
  const candles = useMemo(() => buildCandles(trades, refPrice), [trades, refPrice]);
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const tipId = useId();

  const loc = locale === 'en' ? 'en-US' : 'es-AR';
  const first = candles[0];
  const last = candles[candles.length - 1];
  const span = last.t - first.t;
  const timeFmt = (ts: number) =>
    new Date(ts).toLocaleString(
      loc,
      span < 20 * 3600e3
        ? { hour: '2-digit', minute: '2-digit' }
        : span < 4 * 86400e3
          ? { day: 'numeric', month: 'short', hour: '2-digit' }
          : { day: 'numeric', month: 'short' },
    );
  const fullFmt = (ts: number) =>
    new Date(ts).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const price = (n: number) => money(n, 'USDC', 2);

  const traded = candles.filter((c) => c.v > 0);
  const lowRaw = Math.min(...candles.map((c) => c.l));
  const highRaw = Math.max(...candles.map((c) => c.h));
  const pad = Math.max((highRaw - lowRaw) * 0.08, highRaw * 0.01, 0.01);
  const lo = Math.max(0, lowRaw - pad);
  const hi = highRaw + pad;
  const ticks = niceTicks(lo, hi);
  const plotW = width - PAD_R;
  const slot = plotW / candles.length;
  const bodyW = Math.max(2, Math.min(10, slot * 0.56));
  const y = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * (H_PRICE - PAD_T);
  const x = (i: number) => (i + 0.5) * slot;
  const maxV = Math.max(...candles.map((c) => c.v), 1);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left) / slot);
    setActive(i >= 0 && i < candles.length ? i : null);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((cur) =>
        Math.min(candles.length - 1, Math.max(0, (cur ?? (step > 0 ? -1 : candles.length)) + step)),
      );
    } else if (e.key === 'Escape') setActive(null);
  };
  const hover: Candle | undefined = active === null ? undefined : candles[active];

  return (
    <div ref={box} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
          <li className="flex items-center gap-1.5">
            <span
              className="h-3 w-2 rounded-[2px] border-[1.5px] border-good bg-surface"
              aria-hidden="true"
            />
            {t('markets.candles.up')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-2 rounded-[2px] bg-bad" aria-hidden="true" />
            {t('markets.candles.down')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-[2px] w-2.5 rounded-full bg-ink/30" aria-hidden="true" />
            {t('markets.candles.flat')}
          </li>
        </ul>
        <button type="button" className="btn btn-ghost btn-sm -mr-2" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('shell.kit.hideTable') : t('shell.kit.showTable')}
        </button>
      </div>

      {asTable ? (
        traded.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">
            {t('markets.candles.noTrades')}
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="table-clean">
              <caption className="sr-only">
                {t('markets.candles.summary', {
                  code,
                  last: price(last.c),
                  lo: price(lowRaw),
                  hi: price(highRaw),
                })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('markets.candles.period')}</th>
                  <th scope="col" className="!text-right">
                    {t('markets.candles.open')}
                  </th>
                  <th scope="col" className="!text-right">
                    {t('markets.candles.high')}
                  </th>
                  <th scope="col" className="!text-right">
                    {t('markets.candles.low')}
                  </th>
                  <th scope="col" className="!text-right">
                    {t('markets.candles.close')}
                  </th>
                  <th scope="col" className="!text-right">
                    {t('markets.candles.volume')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {traded.map((c) => (
                  <tr key={c.t}>
                    <td className="whitespace-nowrap">{fullFmt(c.t)}</td>
                    <td className="text-right">{price(c.o)}</td>
                    <td className="text-right">{price(c.h)}</td>
                    <td className="text-right">{price(c.l)}</td>
                    <td className="text-right">{price(c.c)}</td>
                    <td className="text-right">{qty(c.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div
          role="group"
          tabIndex={0}
          aria-label={t('markets.candles.summary', {
            code,
            last: price(last.c),
            lo: price(lowRaw),
            hi: price(highRaw),
          })}
          aria-describedby={hover ? tipId : undefined}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="relative rounded-lg outline-offset-4"
        >
          <svg
            width={width}
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            className="block max-w-full touch-pan-y"
            aria-hidden="true"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          >
            {/* hairline grid + price labels */}
            {ticks.map((p) => (
              <g key={p}>
                <line x1={0} x2={plotW} y1={y(p)} y2={y(p)} stroke="rgb(var(--line))" strokeWidth={1} />
                <text x={plotW + 8} y={y(p) + 4} fontSize={11} fill="rgb(var(--muted))" className="tnum">
                  {p.toFixed(2)}
                </text>
              </g>
            ))}
            <line
              x1={0}
              x2={plotW}
              y1={H_PRICE}
              y2={H_PRICE}
              stroke="rgb(var(--line-strong))"
              strokeWidth={1}
            />

            {/* crosshair */}
            {hover && (
              <line
                x1={x(active!)}
                x2={x(active!)}
                y1={0}
                y2={H}
                stroke="rgb(var(--ink) / 0.25)"
                strokeWidth={1}
              />
            )}

            {candles.map((c, i) => {
              const cx = x(i);
              const dim = active !== null && i !== active ? 0.55 : 1;
              const vh = (c.v / maxV) * H_VOL;
              if (c.v === 0) {
                return (
                  <line
                    key={i}
                    x1={cx - bodyW / 2}
                    x2={cx + bodyW / 2}
                    y1={y(c.c)}
                    y2={y(c.c)}
                    stroke="rgb(var(--ink) / 0.3)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    opacity={dim}
                  />
                );
              }
              const up = c.c >= c.o;
              const color = up ? 'rgb(var(--good))' : 'rgb(var(--bad))';
              const top = Math.min(y(c.o), y(c.c));
              const body = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
              return (
                <g key={i} opacity={dim}>
                  <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={1.5} />
                  <rect
                    x={cx - bodyW / 2 + (up ? 0.75 : 0)}
                    y={top + (up ? 0.75 : 0)}
                    width={bodyW - (up ? 1.5 : 0)}
                    height={Math.max(1, body - (up ? 1.5 : 0))}
                    rx={1.5}
                    fill={up ? 'rgb(var(--surface))' : color}
                    stroke={color}
                    strokeWidth={up ? 1.5 : 0}
                  />
                  <rect
                    x={cx - bodyW / 2}
                    y={H - vh}
                    width={bodyW}
                    height={Math.max(1, vh)}
                    rx={2}
                    fill="rgb(var(--ink) / 0.16)"
                  />
                </g>
              );
            })}

            {/* last price: dashed reference + chip */}
            <line
              x1={0}
              x2={plotW}
              y1={y(last.c)}
              y2={y(last.c)}
              stroke="rgb(var(--ink) / 0.45)"
              strokeDasharray="3 4"
              strokeWidth={1}
            />
            <rect
              x={plotW + 3}
              y={y(last.c) - 10}
              width={PAD_R - 4}
              height={20}
              rx={5}
              fill="rgb(var(--navy))"
            />
            <text
              x={plotW + 3 + (PAD_R - 4) / 2}
              y={y(last.c) + 4}
              fontSize={11}
              fontWeight={500}
              textAnchor="middle"
              fill="rgb(var(--navy-ink))"
              className="tnum"
            >
              {last.c.toFixed(2)}
            </text>
          </svg>

          {traded.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t('markets.candles.noTrades')}</p>
          ) : (
            <div
              className="relative mt-2 h-4 text-[11px] text-muted tnum"
              style={{ width: plotW }}
              aria-hidden="true"
            >
              {[0, 0.33, 0.66, 1].map((f, n) => {
                const i = Math.min(candles.length - 1, Math.round(f * (candles.length - 1)));
                const align = n === 0 ? '' : n === 3 ? '-translate-x-full' : '-translate-x-1/2';
                return (
                  <span
                    key={f}
                    className={`absolute whitespace-nowrap ${align}`}
                    style={{ left: n === 0 ? 0 : n === 3 ? plotW : x(i) }}
                  >
                    {timeFmt(candles[i].t)}
                  </span>
                );
              })}
            </div>
          )}

          {hover && (
            <div
              id={tipId}
              role="status"
              className="pointer-events-none absolute top-1 z-20 min-w-[9.5rem] rounded-lg border border-line bg-surface px-3 py-2 shadow-lift"
              style={x(active!) > plotW / 2 ? { right: width - x(active!) + 12 } : { left: x(active!) + 12 }}
            >
              <p className="text-sm font-semibold text-ink tnum">{price(hover.c)}</p>
              <p className="text-[11px] text-muted">{fullFmt(hover.t)}</p>
              {hover.v > 0 ? (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] tnum">
                  <dt className="text-muted">{t('markets.candles.open')}</dt>
                  <dd className="text-right text-ink">{hover.o.toFixed(2)}</dd>
                  <dt className="text-muted">{t('markets.candles.high')}</dt>
                  <dd className="text-right text-ink">{hover.h.toFixed(2)}</dd>
                  <dt className="text-muted">{t('markets.candles.low')}</dt>
                  <dd className="text-right text-ink">{hover.l.toFixed(2)}</dd>
                  <dt className="text-muted">{t('markets.candles.volume')}</dt>
                  <dd className="text-right text-ink">{qty(hover.v)}</dd>
                </dl>
              ) : (
                <p className="mt-1 text-[11px] text-ink-2">{t('markets.candles.flat')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
