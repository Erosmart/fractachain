import type { SettlePolicy } from '@fractachain/shared';
export type { NetworkSettings } from '../../domain/testnet/NetworkSettings';

export interface SettlePolicyInput {
  settlePolicy?: SettlePolicy;
  settleAt?: string;
}
