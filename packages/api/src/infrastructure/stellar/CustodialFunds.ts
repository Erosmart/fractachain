import type { CustodialBalances, ICustodialFunds } from '../../application/account/AccountPrivacyService';
import { UpstreamError } from '../../shared/errors';
import type { StellarClients } from './StellarClients';

/** Base reserve on Stellar: each entry (account, trustline, offer…) locks 0.5 XLM. */
const BASE_RESERVE_XLM = 0.5;

/**
 * Custodial wallet balances from Horizon. An account that doesn't exist on
 * the network holds nothing; any other failure is an error (never "no funds").
 */
export class HorizonCustodialFunds implements ICustodialFunds {
  constructor(private readonly clients: StellarClients) {}

  async balances(publicKey: string): Promise<CustodialBalances> {
    let account: Awaited<ReturnType<ReturnType<StellarClients['horizon']>['loadAccount']>>;
    try {
      account = await this.clients.horizon().loadAccount(publicKey);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { xlm: 0, minimumXlm: 0, assets: [] };
      throw new UpstreamError('No pudimos leer el saldo de tu wallet en Stellar. Probá de nuevo en un rato.');
    }
    const native = account.balances.find((b) => b.asset_type === 'native');
    const raw = account as unknown as {
      subentry_count?: number;
      num_sponsoring?: number;
      num_sponsored?: number;
    };
    const entries = 2 + (raw.subentry_count ?? 0) + (raw.num_sponsoring ?? 0) - (raw.num_sponsored ?? 0);
    const assets = account.balances
      .filter((b) => b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12')
      .map((b) => {
        const line = b as { asset_code: string; asset_issuer: string; balance: string };
        return { code: line.asset_code, issuer: line.asset_issuer, balance: Number(line.balance) };
      });
    return {
      xlm: native ? Number(native.balance) : 0,
      minimumXlm: entries * BASE_RESERVE_XLM,
      assets,
    };
  }
}
