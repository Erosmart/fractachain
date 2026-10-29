import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS } from '../api/timeouts';
import type { Translate } from '../i18n/translate';
import type { IWalletSigner } from './WalletSigner';

export interface RelayRequest {
  /** Endpoint that returns `{ xdr }` — the unsigned, simulated transaction. */
  prepare: string;
  /** Endpoint that receives the signed `{ xdr }` and relays it to the network. */
  submit: string;
  body?: Record<string, unknown>;
}

/**
 * Self-custody transaction flow: prepare → sign in the wallet → relay.
 * Custodial accounts never use it; the platform signs for them server-side.
 */
export class SelfCustodyRelay {
  constructor(
    private readonly http: IHttpClient,
    private readonly signer: IWalletSigner,
    private readonly t: Translate,
  ) {}

  async signAndRelay<T>(req: RelayRequest): Promise<T> {
    const prepared = await this.http.post<{ xdr?: string }>(req.prepare, req.body ?? {}, { timeoutMs: CHAIN_TIMEOUT_MS });
    if (!prepared?.xdr) throw new Error(this.t('err.noXdr'));
    const signed = await this.signer.signTransaction(prepared.xdr);
    return this.http.post<T>(req.submit, { ...(req.body ?? {}), xdr: signed }, { timeoutMs: CHAIN_TIMEOUT_MS });
  }
}
