import { isContractId } from '../../domain/stellar/StellarAddress';

/** Builds stellar.expert links. */
export class Explorer {
  constructor(private readonly baseUrl: string) {}

  tx(hash?: string | null): string | null {
    return hash ? `${this.baseUrl}/tx/${hash}` : null;
  }

  contract(id?: string | null): string | null {
    return isContractId(id) ? `${this.baseUrl}/contract/${id}` : null;
  }
}
