import { TESTNET_PASSPHRASE } from '@/core/config/AppConfig';
import type { HorizonOperation } from './activity';

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

/** Public Horizon for the configured network (allowed by the CSP: *.stellar.org). */
export function horizonUrlFor(passphrase: string): string {
  return passphrase === TESTNET_PASSPHRASE
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';
}

/**
 * Last operations of a wallet (newest first, up to 200). An account that
 * doesn't exist on the ledger yet has no activity: `[]`.
 */
export async function fetchOperations(
  publicKey: string,
  passphrase: string,
  signal?: AbortSignal,
): Promise<HorizonOperation[]> {
  if (!PUBLIC_KEY.test(publicKey)) return [];
  const url = `${horizonUrlFor(passphrase)}/accounts/${publicKey}/operations?order=desc&limit=200`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/hal+json' } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  const body = (await res.json()) as { _embedded?: { records?: HorizonOperation[] } };
  return Array.isArray(body._embedded?.records) ? body._embedded.records : [];
}
