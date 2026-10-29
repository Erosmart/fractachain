import type { INetworkSettingsProvider, NetworkSettings } from '../../../domain/testnet/NetworkSettings';
import type { IDocumentStore } from '../DocumentStore';

export const NETWORK_SETTINGS_KEY = 'testnet.json';

/** Admin-editable Stellar endpoints and settlement defaults, persisted as `testnet.json`. */
export class JsonNetworkSettingsRepository implements INetworkSettingsProvider {
  private settings: NetworkSettings;

  constructor(
    private readonly store: IDocumentStore,
    defaults: NetworkSettings,
  ) {
    const stored = store.read<Partial<NetworkSettings> | null>(NETWORK_SETTINGS_KEY, null);
    this.settings = { ...defaults, ...(stored ?? {}) };
    if (!stored) this.persist();
  }

  get(): NetworkSettings {
    return { ...this.settings };
  }

  replace(next: NetworkSettings): NetworkSettings {
    this.settings = { ...next };
    this.persist();
    return this.get();
  }

  private persist(): void {
    this.store.write(NETWORK_SETTINGS_KEY, this.settings);
  }
}
