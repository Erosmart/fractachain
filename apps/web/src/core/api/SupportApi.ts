import type { SupportMessageRequest } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';

/** Contact form (`POST /api/support/messages`): works with or without a session. */
export class SupportApi {
  constructor(private readonly http: IHttpClient) {}

  /** Returns the reference id of the message. */
  async send(request: SupportMessageRequest): Promise<string> {
    const body = await this.http.send<{ success: true; id?: string; data?: { id?: string } }>(
      '/api/support/messages',
      { method: 'POST', body: request },
    );
    return String(body.data?.id ?? body.id ?? '');
  }
}
