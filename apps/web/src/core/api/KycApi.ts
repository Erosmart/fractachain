import type { KycProviderInfo, VerificationStart, VerificationView } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { enc } from './timeouts';
import type { KycRecord } from './types';

export interface KycSubmission {
  legalName: string;
  cuit: string;
  selfieDataUrl?: string;
  email?: string;
}

/**
 * Investor-side KYC (`/api/kyc/onboard`, hosted identity verification) and
 * the admin review queue.
 */
export class KycApi {
  constructor(private readonly http: IHttpClient) {}

  async submit(payload: KycSubmission): Promise<unknown> {
    const body = await this.http.send<{ success: true; user: unknown }>('/api/kyc/onboard', {
      method: 'POST',
      body: payload,
    });
    return body.user;
  }

  /** Public: which flow the onboarding shows (Didit or the in-app selfie). */
  async provider(): Promise<KycProviderInfo> {
    const body = await this.http.send<{ success: true; provider?: string; selfieRequired?: boolean }>(
      '/api/kyc/provider',
      { auth: 'none' },
    );
    const provider = body.provider === 'didit' ? 'didit' : 'manual';
    return { provider, selfieRequired: body.selfieRequired ?? provider === 'manual' };
  }

  verification(): Promise<VerificationView> {
    return this.http.get<VerificationView>('/api/kyc/verification');
  }

  /** Starts (or resumes) the hosted verification; the caller redirects to `url`. */
  async startVerification(language: 'es' | 'en'): Promise<VerificationStart> {
    const body = await this.http.send<{ success: true; url?: string; sessionId?: string }>(
      '/api/kyc/verification',
      { method: 'POST', body: { language } },
    );
    return { url: String(body.url ?? ''), sessionId: String(body.sessionId ?? '') };
  }

  /** Asks the API to re-read the decision from the provider (after the browser comes back). */
  syncVerification(): Promise<VerificationView> {
    return this.http.post<VerificationView>('/api/kyc/verification/sync', {});
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
