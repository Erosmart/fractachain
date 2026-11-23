import { Keypair } from '@stellar/stellar-sdk';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { IClock } from '../../shared/clock';

export type WalletChallengePurpose = 'login' | 'link' | 'close';

const PREFIX: Record<WalletChallengePurpose, string> = {
  login: 'fractachain-login:',
  link: 'fractachain-link:',
  close: 'fractachain-close:',
};

export interface IWalletSignatureVerifier {
  /** Returns `null` when valid, or the reason it was refused. */
  verify(
    purpose: WalletChallengePurpose,
    publicKey: string,
    message: string,
    signature: string,
  ): string | null;
}

/**
 * Proof that the caller controls a Stellar key: they sign
 * `fractachain-<purpose>:<epoch ms>` in Freighter (SEP-53).
 *
 * v1 accepted the same signed message for its whole 5-minute window, so a
 * captured payload could be replayed to open more sessions. Each message is
 * now single-use (tracked until it would have expired anyway).
 */
export class Sep53WalletSignatureVerifier implements IWalletSignatureVerifier {
  private static readonly MAX_AGE_MS = 5 * 60 * 1000;
  private readonly seen = new Map<string, number>();

  constructor(private readonly clock: IClock) {}

  verify(
    purpose: WalletChallengePurpose,
    publicKey: string,
    message: string,
    signature: string,
  ): string | null {
    if (!isStellarPublicKey(publicKey)) return 'Public key Stellar inválida';
    const prefix = PREFIX[purpose];
    const ts = Number(message.slice(prefix.length));
    const now = this.clock.now();
    if (
      !message.startsWith(prefix) ||
      !Number.isFinite(ts) ||
      Math.abs(now - ts) > Sep53WalletSignatureVerifier.MAX_AGE_MS
    ) {
      return 'Mensaje de firma inválido o vencido';
    }
    let ok = false;
    try {
      const kp = Keypair.fromPublicKey(publicKey);
      const sig = Buffer.from(signature, 'base64');
      // Freighter signs SEP-53: SHA-256("Stellar Signed Message:\n" + msg).
      // The raw-message signature is still accepted for older wallets.
      ok = kp.verifyMessage(message, sig) || kp.verify(Buffer.from(message, 'utf8'), sig);
    } catch {
      ok = false;
    }
    if (!ok) return 'Firma inválida';

    this.prune(now);
    const key = `${publicKey}|${message}`;
    if (this.seen.has(key)) return 'Esa firma ya se usó. Firmá de nuevo.';
    this.seen.set(key, ts + Sep53WalletSignatureVerifier.MAX_AGE_MS);
    return null;
  }

  private prune(now: number): void {
    for (const [key, until] of this.seen) {
      if (until < now) this.seen.delete(key);
    }
  }
}
