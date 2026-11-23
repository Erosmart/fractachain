import type { AccountCloseRequest, WalletSignaturePayload } from '@fractachain/shared';

export const CLOSE_WORD = 'CERRAR' as const;

/** How the account proves it's really its owner before closing. */
export type CloseProof = 'password' | 'wallet' | 'session';

export function closeProof(user: { authProvider?: string }): CloseProof {
  if (user.authProvider === 'email') return 'password';
  if (user.authProvider === 'wallet') return 'wallet';
  // Google: a session younger than 10 minutes (the API checks it).
  return 'session';
}

/** The confirmation word is typed exactly (case-insensitive, trimmed). */
export function confirmMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === CLOSE_WORD;
}

export function closeRequest(
  proof: CloseProof,
  input: { password?: string; signature?: WalletSignaturePayload },
): AccountCloseRequest {
  return {
    confirm: CLOSE_WORD,
    ...(proof === 'password' ? { password: input.password ?? '' } : {}),
    ...(proof === 'wallet' && input.signature ? { signature: input.signature } : {}),
  };
}

/** `fractachain-datos-2026-10-30.json` */
export function exportFileName(now = new Date()): string {
  return `fractachain-datos-${now.toISOString().slice(0, 10)}.json`;
}
