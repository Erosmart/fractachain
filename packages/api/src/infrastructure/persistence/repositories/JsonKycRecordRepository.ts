import type { IKycRecordRepository, KycRecord } from '../../../domain/kyc/KycRecord';
import type { IDocumentStore } from '../DocumentStore';

export const KYC_KEY = 'kyc.json';

export class JsonKycRecordRepository implements IKycRecordRepository {
  private readonly records: KycRecord[];

  constructor(private readonly store: IDocumentStore) {
    this.records = store.read<KycRecord[]>(KYC_KEY, []);
  }

  findById(id: string): KycRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  findByUserId(userId: string): KycRecord | undefined {
    return this.records.find((r) => r.userId === userId);
  }

  findBySessionId(sessionId: string): KycRecord | undefined {
    return this.records.find((r) => r.verification?.sessionId === sessionId);
  }

  list(): KycRecord[] {
    return [...this.records];
  }

  upsert(record: KycRecord): void {
    const idx = this.records.findIndex((r) => r.id === record.id);
    if (idx >= 0) this.records[idx] = record;
    else this.records.unshift(record);
    this.store.write(KYC_KEY, this.records);
  }
}
