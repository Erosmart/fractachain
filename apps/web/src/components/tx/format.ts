import type { ChainAsset, TxBuildResult } from '@fractachain/shared';
import { formatAmount } from '@/core/format/number';

export const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 5)}…${id.slice(-5)}` : id);

/** Base units (as the contract sees them) → decimal amount, using the token's decimals. */
export function fromBaseUnits(value: string, decimals: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n / 10 ** decimals;
}

/** Amount with its asset code, never a hard-coded currency ("20 USDC", "15,5 XLM"). */
export function assetAmount(n: number, code: string, digits?: number): string {
  const v = Number(n) || 0;
  return `${formatAmount(v, digits ?? (Number.isInteger(v) ? 0 : 2))} ${code}`;
}

export const assetCode = (asset: Pick<ChainAsset, 'code'> | null | undefined, fallback = '') =>
  asset?.code || fallback;

/** Stroops → XLM, for the fee line. */
export const feeXlm = (stroops: string) => {
  const n = Number(stroops);
  return Number.isFinite(n) ? `${(n / 1e7).toLocaleString('es-AR', { maximumFractionDigits: 7 })} XLM` : '—';
};

/** Rows to show before signing: amounts converted with the asset decimals, addresses shortened. */
export function reviewArgs(build: TxBuildResult): { name: string; value: string }[] {
  return (build.args ?? []).map((a) => {
    const isAmount = /amount|value|price/i.test(a.name) && build.asset && /^-?\d+$/.test(a.value);
    if (isAmount && build.asset) {
      return {
        name: a.name,
        value: assetAmount(fromBaseUnits(a.value, build.asset.decimals), build.asset.code, 2),
      };
    }
    if (/^[GC][A-Z2-7]{55}$/.test(a.value)) return { name: a.name, value: shortId(a.value) };
    return a;
  });
}
