import type { SupportMessage, SupportTopic } from '@fractachain/shared';

export type { SupportMessage, SupportTopic };

export const SUPPORT_TOPICS: readonly SupportTopic[] = [
  'general',
  'kyc',
  'issuer',
  'privacy',
  'security',
  'bug',
];

export interface ISupportRepository {
  insert(message: SupportMessage): void;
  update(message: SupportMessage): void;
  findById(id: string): SupportMessage | undefined;
  list(): SupportMessage[];
}
