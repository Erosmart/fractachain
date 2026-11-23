import type { StellarClients } from './StellarClients';

export interface ClassicBalance {
  code: string;
  issuer: string;
  balance: number;
}

export interface AccountSnapshot {
  exists: boolean;
  xlm: number;
  assets: ClassicBalance[];
}

/** Classic account balances (XLM and trustlines), read from Horizon. */
export interface IAccountReader {
  snapshot(address: string): Promise<AccountSnapshot>;
}

export class HorizonAccountReader implements IAccountReader {
  constructor(private readonly clients: StellarClients) {}

  async snapshot(address: string): Promise<AccountSnapshot> {
    try {
      const account = await this.clients.horizon().loadAccount(address);
      let xlm = 0;
      const assets: ClassicBalance[] = [];
      for (const b of account.balances) {
        if (b.asset_type === 'native') xlm = Number(b.balance);
        else if ('asset_code' in b && 'asset_issuer' in b) {
          assets.push({ code: b.asset_code, issuer: b.asset_issuer, balance: Number(b.balance) });
        }
      }
      return { exists: true, xlm, assets };
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { exists: false, xlm: 0, assets: [] };
      throw err;
    }
  }
}
