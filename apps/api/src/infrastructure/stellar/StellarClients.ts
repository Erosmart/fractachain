import { Horizon, rpc } from '@stellar/stellar-sdk';
import type { INetworkSettingsProvider } from '../../domain/testnet/NetworkSettings';

/**
 * Horizon / Soroban RPC clients, created once per endpoint.
 *
 * Endpoints come from the admin-editable network settings, so a change in
 * Admin → Testnet takes effect on the next call without a restart — and every
 * module talks to the same nodes.
 */
export class StellarClients {
  private horizonClient: Horizon.Server | null = null;
  private horizonUrl = '';
  private rpcClient: rpc.Server | null = null;
  private rpcUrl = '';

  constructor(private readonly settings: INetworkSettingsProvider) {}

  horizon(): Horizon.Server {
    const url = this.settings.get().horizonUrl;
    if (!this.horizonClient || this.horizonUrl !== url) {
      this.horizonClient = new Horizon.Server(url, { allowHttp: url.startsWith('http://') });
      this.horizonUrl = url;
    }
    return this.horizonClient;
  }

  rpc(): rpc.Server {
    const url = this.settings.get().rpcUrl;
    if (!this.rpcClient || this.rpcUrl !== url) {
      this.rpcClient = new rpc.Server(url, { allowHttp: url.startsWith('http://') });
      this.rpcUrl = url;
    }
    return this.rpcClient;
  }

  rpcUrlValue(): string {
    return this.settings.get().rpcUrl;
  }

  networkPassphrase(): string {
    return this.settings.get().networkPassphrase;
  }

  isTestnet(): boolean {
    return this.networkPassphrase().includes('Test SDF');
  }
}
