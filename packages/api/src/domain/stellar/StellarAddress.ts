import { StrKey } from '@stellar/stellar-sdk';

/** `G…` account address with a valid checksum. */
export function isStellarPublicKey(value?: string | null): value is string {
  if (!value) return false;
  try {
    return StrKey.isValidEd25519PublicKey(value);
  } catch {
    return false;
  }
}

/** `C…` Soroban contract address with a valid checksum. */
export function isContractId(value?: string | null): value is string {
  if (!value) return false;
  try {
    return StrKey.isValidContract(value);
  } catch {
    return false;
  }
}

export function normalizeAddress(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/** Stellar amounts carry at most 7 decimals. */
export const STROOPS_PER_UNIT = 10_000_000n;
