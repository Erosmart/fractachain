import type { WalletSignaturePayload } from '@fractachain/shared';
import type { Translate } from '../i18n/translate';
import type { IWalletSigner } from './WalletSigner';

type FreighterApi = typeof import('@stellar/freighter-api');

const LOGIN_PREFIX = 'fractachain-login:';
const LINK_PREFIX = 'fractachain-link:';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

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

  async address(): Promise<string> {
    const freighter = await this.load();
    const conn = await freighter.isConnected().catch(() => ({ isConnected: false }));
    if (!conn.isConnected) throw new Error(this.t('err.freighterMissing'));
    const allowed = await freighter.isAllowed().catch(() => ({ isAllowed: false }));
    if (!allowed.isAllowed) {
      const access = await freighter.requestAccess();
      if (access.error) throw new Error(access.error.message || this.t('err.freighterRejected'));
    }
    const { address, error } = await freighter.getAddress();
    if (error || !address) throw new Error(error?.message || this.t('err.freighterNoAddress'));
    return address;
  }

  signLoginChallenge(): Promise<WalletSignaturePayload> {
    return this.signChallenge(LOGIN_PREFIX);
  }

  signLinkChallenge(): Promise<WalletSignaturePayload> {
    return this.signChallenge(LINK_PREFIX);
  }

  async signTransaction(xdr: string): Promise<string> {
    const freighter = await this.load();
    const address = await this.address();
    const net = await freighter.getNetwork().catch(() => ({ networkPassphrase: '' }));
    if (net.networkPassphrase && net.networkPassphrase !== this.networkPassphrase) {
      throw new Error(this.t('err.freighterWrongNet'));
    }
    const res = await freighter.signTransaction(xdr, { address, networkPassphrase: this.networkPassphrase });
    if (res.error) throw new Error(res.error.message || this.t('err.freighterSignRejected'));
    if (!res.signedTxXdr) throw new Error(this.t('err.freighterNoSignedTx'));
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
