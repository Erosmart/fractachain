import type { WalletSignaturePayload } from '@fractachain/shared';

/** What the page can tell about the wallet before asking it to sign. */
export interface WalletDetection {
  /** The extension answered at all. */
  installed: boolean;
  /** The site is already allowed to read the address (no popup needed). */
  allowed: boolean;
  /** Active address, when allowed. */
  address: string | null;
  /** Network name as the wallet reports it ("TESTNET", "PUBLIC", …). */
  network: string | null;
  networkPassphrase: string | null;
  /** The wallet is on the network the platform runs on. */
  networkOk: boolean;
}

export interface SignOptions {
  /** Account that must sign (the investor's linked G… address). */
  address?: string;
  /** Network the transaction was built for. */
  networkPassphrase?: string;
}

export type WalletErrorCode =
  | 'WALLET_NOT_INSTALLED'
  | 'WALLET_DENIED'
  | 'WRONG_NETWORK'
  | 'ACCOUNT_MISMATCH'
  | 'USER_REJECTED'
  | 'NO_SIGNED_TX';

/** A wallet problem the UI can explain precisely (install, unlock, switch network…). */
export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
    /** Extra facts for the message (the wallet's network, the expected account…). */
    readonly facts: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

/**
 * A wallet that holds the investor's key. The platform never sees it: it asks
 * the wallet to sign challenges (login / link) and transactions it built.
 */
export interface IWalletSigner {
  address(): Promise<string>;
  /** Installed? allowed? which network and address? — never opens a popup. */
  detect(): Promise<WalletDetection>;
  /** Signs `fractachain-login:<ts>` — proves control of the key to start a session. */
  signLoginChallenge(): Promise<WalletSignaturePayload>;
  /** Signs `fractachain-link:<ts>` — attaches the key to an existing account. */
  signLinkChallenge(): Promise<WalletSignaturePayload>;
  /** Signs `fractachain-close:<ts>` — proves control of the key to close the account. */
  signCloseChallenge(): Promise<WalletSignaturePayload>;
  /** Signs a transaction XDR the backend already built and simulated. */
  signTransaction(xdr: string, options?: SignOptions): Promise<string>;
}
