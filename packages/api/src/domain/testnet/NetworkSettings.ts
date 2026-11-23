import type { SettlePolicy } from '@fractachain/shared';

export type TestnetMode = 'local' | 'faucet' | 'deploy';

/**
 * Admin-editable network settings (Admin → Testnet). Every Stellar client
 * reads its endpoints from here — v1 had two sources of truth (env for
 * balances, this file for SDEX), so balances and the book could hit
 * different nodes.
 */
export interface NetworkSettings {
  mode: TestnetMode;
  friendbot: boolean;
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  notes: string;
  settlePolicy: SettlePolicy;
  settleAt?: string;
  updatedAt: string;
}

export interface INetworkSettingsProvider {
  get(): NetworkSettings;
}
