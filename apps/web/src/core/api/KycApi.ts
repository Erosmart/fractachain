import type { IHttpClient } from '../http/HttpClient';
import { enc } from './timeouts';
import type { KycRecord } from './types';

export interface KycSubmission {
  legalName: string;
  cuit: string;
  selfieDataUrl?: string;
  email?: string;
}

/** Investor-side KYC (`/api/kyc/onboard`) and the admin review queue. */
export class KycApi {
  constructor(private readonly http: IHttpClient) {}

  async submit(payload: KycSubmission): Promise<unknown> {
    const body = await this.http.send<{ success: true; user: unknown }>('/api/kyc/onboard', {
      method: 'POST',
      body: payload,
    });
    return body.user;
  }

  async list(): Promise<KycRecord[]> {
    const data = await this.http.get<unknown>('/api/kyc');
    return Array.isArray(data) ? (data as KycRecord[]) : [];
  }

  approve(id: string): Promise<unknown> {
    return this.http.send(`/api/kyc/${enc(id)}/approve`, { method: 'POST', body: {} });
  }

  reject(id: string, reason: string): Promise<unknown> {
    return this.http.send(`/api/kyc/${enc(id)}/reject`, { method: 'POST', body: { reason } });
  }

  /** Selfies sit behind admin/owner auth, so they are fetched as blobs, never `<img src>`. */
  selfie(selfieUrl: string): Promise<Blob> {
    return this.http.blob(selfieUrl);
  }
}
