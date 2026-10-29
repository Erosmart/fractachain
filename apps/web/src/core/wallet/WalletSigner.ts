import type { WalletSignaturePayload } from '@fractachain/shared';

/**
 * A wallet that holds the investor's key. The platform never sees it: it asks
 * the wallet to sign challenges (login / link) and transactions it built.
 */
export interface IWalletSigner {
  address(): Promise<string>;
  /** Signs `fractachain-login:<ts>` — proves control of the key to start a session. */
  signLoginChallenge(): Promise<WalletSignaturePayload>;
  /** Signs `fractachain-link:<ts>` — attaches the key to an existing account. */
  signLinkChallenge(): Promise<WalletSignaturePayload>;
  /** Signs a transaction XDR the backend already built and simulated. */
  signTransaction(xdr: string): Promise<string>;
}
