import type { Position } from '@/core/api/types';

/** Categorical slot (viz-1..4, fixed order) or the neutral "others" fold. */
export type Slot = 1 | 2 | 3 | 4 | 'other';

export interface Segment {
  key: string;
  label: string;
  value: number;
  slot: Slot;
}

/**
 * Split of the token value by asset. Up to four assets each get a slot; past
 * four, the three largest stay and the rest fold into "Otros" (never a 5th
 * hue). Slots follow the ticker's alphabetical order among the shown assets,
 * so an asset keeps its color when values move.
 */
export function byAsset(positions: Position[], othersLabel: string): Segment[] {
  const rows = positions
    .filter((p) => p.marketValue > 0)
    .map((p) => ({ key: p.listingId, label: p.tokenTicker, value: p.marketValue }));
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const shown = rows.length <= 4 ? rows : sorted.slice(0, 3);
  const folded = rows.length <= 4 ? [] : sorted.slice(3);
  const slotOrder = [...shown].sort((a, b) => a.label.localeCompare(b.label));
  const segments: Segment[] = slotOrder.map((r, i) => ({ ...r, slot: (i + 1) as Slot }));
  if (folded.length) {
    segments.push({
      key: 'others',
      label: othersLabel,
      value: folded.reduce((s, r) => s + r.value, 0),
      slot: 'other',
    });
  }
  return segments;
}

/** Tokens vs. cash, both in USDC. */
export function byType(
  tokensValue: number,
  cashUsdc: number,
  labels: { tokens: string; cash: string },
): Segment[] {
  return [
    { key: 'tokens', label: labels.tokens, value: Math.max(0, tokensValue), slot: 1 as Slot },
    { key: 'cash', label: labels.cash, value: Math.max(0, cashUsdc), slot: 2 as Slot },
  ].filter((s) => s.value > 0);
}

export const shareOf = (segments: Segment[], s: Segment) => {
  const total = segments.reduce((acc, x) => acc + x.value, 0);
  return total > 0 ? s.value / total : 0;
};
