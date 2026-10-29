import type { WalletApi } from '../api/WalletApi';
import type { UsdcFundResult } from '../api/types';
import type { IWalletSigner } from './WalletSigner';

/**
 * Makes a wallet able to hold testnet USDC and tops it up with the platform
 * grant. Custodial wallets are handled entirely server-side; self-custody
 * wallets sign the one `changeTrust` the ledger requires from the owner.
 */
export class UsdcFundingService {
  constructor(
    private readonly wallet: WalletApi,
    private readonly signer: IWalletSigner,
  ) {}

  async ensureReady(onNeedsSignature?: () => void): Promise<UsdcFundResult> {
    const result = await this.wallet.fundUsdc();
    if (result?.status === 'NEED_TRUSTLINE' && result.xdr) {
      onNeedsSignature?.();
      const signed = await this.signer.signTransaction(result.xdr);
      return this.wallet.submitUsdcTrustline(signed);
    }
    return result;
  }
}
