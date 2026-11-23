import type { WalletSignaturePayload } from '@fractachain/shared';
import type { Translate } from '../i18n/translate';
import { WalletError, type IWalletSigner, type SignOptions, type WalletDetection } from './WalletSigner';

type FreighterApi = typeof import('@stellar/freighter-api');

const LOGIN_PREFIX = 'fractachain-login:';
const LINK_PREFIX = 'fractachain-link:';
const CLOSE_PREFIX = 'fractachain-close:';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Freighter reports a user "decline" as an error message; it has no stable code. */
const REJECTED = /reject|declin|denied|cancel/i;

/**
 * Freighter browser extension. The API module is imported lazily so pages
 * that never sign anything do not ship it.
 */
export class FreighterWalletSigner implements IWalletSigner {
  private api: Promise<FreighterApi> | null = null;

  constructor(
    private readonly networkPassphrase: string,
    private readonly t: Translate,
  ) {}

  async detect(): Promise<WalletDetection> {
    const none: WalletDetection = {
      installed: false,
      allowed: false,
      address: null,
      network: null,
      networkPassphrase: null,
      networkOk: false,
    };
    if (typeof window === 'undefined') return none;
    const freighter = await this.load().catch(() => null);
    if (!freighter) return none;
    const conn = await freighter.isConnected().catch(() => ({ isConnected: false }));
    if (!conn.isConnected) return none;
    const allowed = Boolean((await freighter.isAllowed().catch(() => ({ isAllowed: false }))).isAllowed);
    const details = await freighter
      .getNetworkDetails()
      .catch(
        () => ({ network: '', networkPassphrase: '' }) as { network: string; networkPassphrase: string },
      );
    const address = allowed ? ((await freighter.getAddress().catch(() => null))?.address ?? null) : null;
    const passphrase = details.networkPassphrase || null;
    return {
      installed: true,
      allowed,
      address: address || null,
      network: details.network || null,
      networkPassphrase: passphrase,
      networkOk: passphrase === this.networkPassphrase,
    };
  }

  async address(): Promise<string> {
    const freighter = await this.load();
    const conn = await freighter.isConnected().catch(() => ({ isConnected: false }));
    if (!conn.isConnected) throw new WalletError('WALLET_NOT_INSTALLED', this.t('err.freighterMissing'));
    const allowed = await freighter.isAllowed().catch(() => ({ isAllowed: false }));
    if (!allowed.isAllowed) {
      const access = await freighter.requestAccess();
      if (access.error) {
        throw new WalletError('WALLET_DENIED', access.error.message || this.t('err.freighterRejected'));
      }
    }
    const { address, error } = await freighter.getAddress();
    if (error || !address) {
      throw new WalletError('WALLET_DENIED', error?.message || this.t('err.freighterNoAddress'));
    }
    return address;
  }

  signLoginChallenge(): Promise<WalletSignaturePayload> {
    return this.signChallenge(LOGIN_PREFIX);
  }

  signLinkChallenge(): Promise<WalletSignaturePayload> {
    return this.signChallenge(LINK_PREFIX);
  }

  signCloseChallenge(): Promise<WalletSignaturePayload> {
    return this.signChallenge(CLOSE_PREFIX);
  }

  async signTransaction(xdr: string, options: SignOptions = {}): Promise<string> {
    const freighter = await this.load();
    const address = await this.address();
    const wanted = options.networkPassphrase || this.networkPassphrase;
    const net = await freighter
      .getNetworkDetails()
      .catch(
        () => ({ network: '', networkPassphrase: '' }) as { network: string; networkPassphrase: string },
      );
    if (net.networkPassphrase && net.networkPassphrase !== wanted) {
      throw new WalletError('WRONG_NETWORK', this.t('err.freighterWrongNet'), {
        network: net.network || net.networkPassphrase,
      });
    }
    if (options.address && options.address !== address) {
      throw new WalletError('ACCOUNT_MISMATCH', this.t('err.freighterWrongNet'), {
        expected: options.address,
        actual: address,
      });
    }
    const res = await freighter.signTransaction(xdr, { address, networkPassphrase: wanted });
    if (res.error) {
      const message = res.error.message || this.t('err.freighterSignRejected');
      throw new WalletError(REJECTED.test(message) ? 'USER_REJECTED' : 'WALLET_DENIED', message);
    }
    if (!res.signedTxXdr) throw new WalletError('NO_SIGNED_TX', this.t('err.freighterNoSignedTx'));
    return res.signedTxXdr;
  }

  private async signChallenge(prefix: string): Promise<WalletSignaturePayload> {
    const freighter = await this.load();
    const address = await this.address();
    const message = `${prefix}${Date.now()}`;
    const res = await freighter.signMessage(message, { address });
    if (res.error) throw new Error(res.error.message || this.t('err.freighterNoSign'));
    const sig: unknown = res.signedMessage;
    if (!sig) throw new Error(this.t('err.freighterNoSign'));
    const signature = typeof sig === 'string' ? sig : toBase64(sig as Uint8Array);
    return { publicKey: address, message, signature };
  }

  private load(): Promise<FreighterApi> {
    this.api ??= import('@stellar/freighter-api');
    return this.api;
  }
}
