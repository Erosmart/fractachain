import crypto from 'crypto';
import type {
  IIdentityVerificationProvider,
  IWebhookAuthenticator,
  ProviderDecision,
  ProviderSession,
  ProviderSessionStatus,
  StartVerificationInput,
} from '../../domain/kyc/IdentityVerification';
import { UpstreamError } from '../../shared/errors';

export interface DiditOptions {
  apiKey: string;
  workflowId: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface DiditIdVerification {
  status?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  document_type?: string;
  document_number?: string;
  nationality?: string;
  issuing_state?: string;
}

interface DiditCheck {
  status?: string;
  total_hits?: number;
}

/** Shape of `GET /v3/session/{id}/decision/` and of the webhook `decision` object. */
export interface DiditDecisionBody {
  session_id?: string;
  status?: ProviderSessionStatus;
  vendor_data?: string;
  id_verifications?: DiditIdVerification[];
  liveness_checks?: DiditCheck[];
  face_matches?: DiditCheck[];
  aml_screenings?: DiditCheck[];
}

/**
 * Didit identity verification (https://docs.didit.me), API v3.
 * Sessions are created server-side with the API key; the investor completes
 * the hosted flow at `url` and comes back to `callback`.
 */
export class DiditClient implements IIdentityVerificationProvider {
  readonly name = 'didit' as const;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DiditOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  }

  async startSession(input: StartVerificationInput): Promise<ProviderSession> {
    const body = await this.request<{ session_id: string; url: string; status: ProviderSessionStatus }>(
      'POST',
      '/v3/session/',
      {
        workflow_id: this.options.workflowId,
        vendor_data: input.accountId,
        callback: input.callbackUrl,
        language: input.language,
        ...(input.email ? { contact_details: { email: input.email, send_notification_emails: false } } : {}),
      },
    );
    if (!body.session_id || !body.url) throw new UpstreamError('Didit no devolvió la sesión de verificación');
    return { sessionId: body.session_id, url: body.url, status: body.status ?? 'Not Started' };
  }

  async fetchDecision(sessionId: string): Promise<ProviderDecision> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) throw new UpstreamError('Sesión de Didit inválida');
    const body = await this.request<DiditDecisionBody>(
      'GET',
      `/v3/session/${encodeURIComponent(sessionId)}/decision/`,
    );
    return DiditClient.toDecision(body, sessionId);
  }

  /** Normalizes a Didit decision (API or webhook) keeping only what the platform needs. */
  static toDecision(body: DiditDecisionBody, fallbackSessionId?: string): ProviderDecision {
    const id = body.id_verifications?.[0];
    const fullName = id?.full_name || [id?.first_name, id?.last_name].filter(Boolean).join(' ') || undefined;
    const doc = id?.document_number ? String(id.document_number) : undefined;
    return {
      sessionId: body.session_id ?? fallbackSessionId ?? '',
      status: body.status ?? 'In Progress',
      vendorData: body.vendor_data,
      identity: {
        fullName,
        documentType: id?.document_type,
        documentNumberLast4: doc ? doc.slice(-4) : undefined,
        nationality: id?.nationality,
        issuingState: id?.issuing_state,
      },
      checks: {
        document: id?.status,
        liveness: body.liveness_checks?.[0]?.status,
        faceMatch: body.face_matches?.[0]?.status,
        aml: body.aml_screenings?.[0]?.status,
        amlHits: body.aml_screenings?.[0]?.total_hits,
      },
    };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.options.timeoutMs ?? 15_000);
    try {
      const res = await this.fetchImpl(`${this.options.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          'x-api-key': this.options.apiKey,
          accept: 'application/json',
          ...(payload ? { 'content-type': 'application/json' } : {}),
        },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new UpstreamError(`Didit respondió ${res.status}`, { body: text.slice(0, 300) });
      return (text ? JSON.parse(text) : {}) as T;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError('No se pudo contactar a Didit');
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Webhook authentication
 * ------------------------------------------------------------------ */

export interface DiditWebhookHeaders {
  timestamp?: string;
  signatureV2?: string[];
  signature?: string[];
}

/** Didit's canonical JSON: keys sorted recursively, whole floats as ints, compact, Unicode kept. */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v !== null && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = normalize((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    if (typeof v === 'number' && Number.isFinite(v) && v % 1 === 0) return Math.trunc(v);
    return v;
  };
  return JSON.stringify(normalize(value));
}

const hmacHex = (secret: string, data: string | Buffer) =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual.trim().toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a Didit webhook: fresh `X-Timestamp` (±300 s) and a valid
 * `X-Signature-V2` (canonical JSON) or `X-Signature` (raw body). The
 * envelope-only `X-Signature-Simple` is not accepted: it doesn't cover the
 * decision. `-Previous` headers (secret rotation) are passed in the arrays.
 */
export function verifyDiditWebhook(
  secret: string,
  headers: DiditWebhookHeaders,
  rawBody: Buffer | undefined,
  parsed: unknown,
  nowMs = Date.now(),
): boolean {
  const ts = Number(headers.timestamp);
  if (!secret || !Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const v2 = hmacHex(secret, canonicalJson(parsed));
  if ((headers.signatureV2 ?? []).some((sig) => safeEqualHex(v2, sig))) return true;
  if (rawBody) {
    const v1 = hmacHex(secret, rawBody);
    if ((headers.signature ?? []).some((sig) => safeEqualHex(v1, sig))) return true;
  }
  return false;
}

const headerList = (headers: Record<string, string | string[] | undefined>, ...names: string[]): string[] =>
  names.flatMap((n) => {
    const v = headers[n];
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  });

/** `IWebhookAuthenticator` for Didit (headers are lower-cased by Node). */
export class DiditWebhookAuthenticator implements IWebhookAuthenticator {
  constructor(
    private readonly secret: string | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  get configured(): boolean {
    return Boolean(this.secret);
  }

  verify(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    body: unknown,
  ): boolean {
    if (!this.secret) return false;
    return verifyDiditWebhook(
      this.secret,
      {
        timestamp: headerList(headers, 'x-timestamp')[0],
        signatureV2: headerList(headers, 'x-signature-v2', 'x-signature-v2-previous'),
        signature: headerList(headers, 'x-signature', 'x-signature-previous'),
      },
      rawBody,
      body,
      this.now(),
    );
  }
}
