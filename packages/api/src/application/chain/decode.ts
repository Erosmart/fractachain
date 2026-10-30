/**
 * Pure decoding of contract return values (`scValToNative` output) into the
 * shapes the web shows. No I/O: everything here is unit-tested.
 */
import type { TenderStateName } from '@fractachain/shared';

export const TENDER_STATES: readonly TenderStateName[] = ['Open', 'Successful', 'Failed', 'Terminated'];
export const FORWARD_STATES = ['Active', 'Fulfilled', 'Cancelled'] as const;
export const WARRANT_STATUSES = ['Deposited', 'ActiveLoan', 'Repaid', 'Liquidated'] as const;

type Raw = unknown;

export function toBigInt(value: Raw): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new TypeError(`no es un entero: ${String(value)}`);
}

/** Base units → decimal number using the token's own `decimals()`. Exact up to the float conversion. */
export function scaleDown(value: Raw, decimals: number): number {
  const n = toBigInt(value);
  if (decimals <= 0) return Number(n);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0');
  return Number(`${neg ? '-' : ''}${whole}.${frac}`);
}

/** Plain integer counts (units, kilos, shares, bps). */
export function toInt(value: Raw): number {
  return Number(toBigInt(value));
}

/** Ledger timestamp (seconds) → ISO; 0 means "not set". */
export function toIsoOrNull(value: Raw): string | null {
  const seconds = toBigInt(value);
  if (seconds <= 0n) return null;
  return new Date(Number(seconds) * 1000).toISOString();
}

/** Integer-discriminant enum → name (unknown codes keep the number visible). */
export function enumName<T extends string>(
  names: readonly T[],
  value: Raw,
): { code: number; name: T | string } {
  const code = Array.isArray(value) ? NaN : toInt(value);
  if (Array.isArray(value) && typeof value[0] === 'string') {
    // Unit-variant enums without discriminants decode as ['Name'].
    const idx = names.indexOf(value[0] as T);
    return { code: idx, name: value[0] };
  }
  return { code, name: names[code] ?? `#${code}` };
}

export function asString(value: Raw): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return String(value ?? '');
}

export function asHex(value: Raw): string {
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return asString(value);
}

export function asTuple(value: Raw, length: number, fn: string): Raw[] {
  if (!Array.isArray(value) || value.length < length) {
    throw new TypeError(`${fn}() devolvió un formato inesperado`);
  }
  return value;
}

/** `name()` of a Stellar Asset Contract: "native" or "CODE:ISSUER". */
export function parseSacName(name: string): { code: string; issuer: string | null } | null {
  if (name === 'native') return { code: 'XLM', issuer: null };
  const match = /^([A-Za-z0-9]{1,12}):(G[A-Z2-7]{55})$/.exec(name);
  return match ? { code: match[1], issuer: match[2] } : null;
}

/**
 * `get_caps()` / `get_deadline()` on new tenders. Accepts a `(soft, hard)`
 * tuple or a `{ soft_cap, hard_cap }` struct.
 */
export function decodeCaps(value: Raw): { soft: Raw; hard: Raw } {
  if (Array.isArray(value) && value.length >= 2) return { soft: value[0], hard: value[1] };
  if (value && typeof value === 'object') {
    const o = value as Record<string, Raw>;
    const soft = o.soft_cap ?? o.soft;
    const hard = o.hard_cap ?? o.hard;
    if (soft !== undefined && hard !== undefined) return { soft, hard };
  }
  throw new TypeError('get_caps() devolvió un formato inesperado');
}
