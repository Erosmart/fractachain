import { Asset, BASE_FEE, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { PlatformKeyring } from './PlatformKeyring';
import type { StellarClients } from './StellarClients';

/**
 * Read-mostly account queries against Horizon (balances), plus the XLM
 * top-up that keeps funded-but-broke wallets able to pay fees.
 */
export class HorizonAccounts {
  constructor(
    private readonly clients: StellarClients,
    private readonly keyring: PlatformKeyring,
    private readonly xlmFloor: number,
    private readonly xlmTopUp: number,
  ) {}

  async nativeXlm(publicKey: string): Promise<number> {
    try {
      const account = await this.clients.horizon().loadAccount(publicKey);
      const native = account.balances.find((b) => b.asset_type === 'native');
      return native ? Number(native.balance) : 0;
    } catch {
      return 0;
    }
  }

  async assetBalance(publicKey: string, code: string, issuer: string): Promise<number> {
    try {
      const account = await this.clients.horizon().loadAccount(publicKey);
      const line = account.balances.find(
        (b) =>
          (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
          b.asset_code === code &&
          b.asset_issuer === issuer,
      );
      return line ? Number(line.balance) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Friendbot only creates accounts, it never refills. A wallet below the
   * floor cannot even pay fees, so the deployer tops it up. A plain payment
   * needs no recipient signature, which makes this safe for self-custody.
   */
  async topUpXlm(publicKey: string): Promise<{ topped: boolean; balance: number; hash?: string }> {
    if (!isStellarPublicKey(publicKey)) return { topped: false, balance: 0 };
    const horizon = this.clients.horizon();
    let balance: number;
    try {
      const account = await horizon.loadAccount(publicKey);
      balance = Number(account.balances.find((b) => b.asset_type === 'native')?.balance || 0);
    } catch {
      return { topped: false, balance: 0 }; // not on-ledger yet — Friendbot creates those
    }
    if (balance >= this.xlmFloor) return { topped: false, balance };
    const payer = this.keyring.deployer();
    const source = await horizon.loadAccount(payer.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: String(Number(BASE_FEE) * 100),
      networkPassphrase: this.clients.networkPassphrase(),
    })
      .addOperation(
        Operation.payment({ destination: publicKey, asset: Asset.native(), amount: String(this.xlmTopUp) }),
      )
      .setTimeout(60)
      .build();
    tx.sign(payer);
    const res = await horizon.submitTransaction(tx);
    return { topped: true, balance: balance + this.xlmTopUp, hash: (res as { hash?: string }).hash };
  }
}
