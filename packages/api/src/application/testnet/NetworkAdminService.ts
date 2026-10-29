import type { NetworkSettings, SettlePolicyInput } from './types';
import type { JsonNetworkSettingsRepository } from '../../infrastructure/persistence/repositories/JsonNetworkSettingsRepository';
import type { IDeploymentRegistry } from '../../infrastructure/stellar/DeploymentRegistry';
import type { PlatformKeyring } from '../../infrastructure/stellar/PlatformKeyring';
import type { SdexGateway } from '../../infrastructure/stellar/SdexGateway';
import { ValidationError } from '../../shared/errors';

/** Admin → Testnet: network endpoints, settlement defaults and issuer setup. */
export class NetworkAdminService {
  constructor(
    private readonly settings: JsonNetworkSettingsRepository,
    private readonly deployments: IDeploymentRegistry,
    private readonly keyring: PlatformKeyring,
    private readonly sdex: SdexGateway,
  ) {}

  async overview() {
    return {
      ...this.settings.get(),
      onChain: this.deployments.isOnChainDeployed(),
      deployment: this.deployments.load(),
      // The issuer the backend can sign for: new listings default to it, since
      // tokens issued by an account we cannot sign with are undistributable.
      activeIssuer:
        this.keyring.platformIssuerPublicKey() ||
        (await this.keyring.ensurePlatformIssuer().catch(() => null))?.publicKey() ||
        null,
    };
  }

  update(partial: Partial<NetworkSettings> & SettlePolicyInput): NetworkSettings {
    const current = this.settings.get();
    const next: NetworkSettings = { ...current, ...partial, updatedAt: new Date().toISOString() };
    next.settlePolicy =
      partial.settlePolicy === 'ON_DATE' || next.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN';
    if (partial.settlePolicy === 'ON_MIN') {
      next.settlePolicy = 'ON_MIN';
      next.settleAt = undefined;
    }
    if (next.settlePolicy === 'ON_DATE') {
      const at = partial.settleAt ?? next.settleAt;
      if (!at) throw new ValidationError('Indicá la fecha hasta la que esperás para repartir tokens');
      const date = new Date(at);
      if (Number.isNaN(date.getTime())) throw new ValidationError('Fecha inválida');
      next.settleAt = date.toISOString();
    }
    return this.settings.replace(next);
  }

  async configureIssuer(clawback: boolean) {
    const r = await this.sdex.configureIssuerForRegulatedAsset({ clawback });
    return { hash: r.hash, ledger: r.ledger };
  }
}
