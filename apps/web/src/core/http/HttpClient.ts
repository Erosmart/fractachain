/**
 * HTTP abstraction every API class depends on (DIP): swapping the transport —
 * or faking it in tests — never touches the API classes or the UI.
 */

export interface ApiIssue {
  path: string;
  message: string;
}

/** Failure of an API call, normalized from HTTP status + `{ success:false }` envelope. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly issues?: ApiIssue[],
    /** Extra fields of the error body (e.g. `hash` / `explorer` of a failed transaction). */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** No HTTP response at all (DNS, CORS, connection refused, offline). */
  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }
}

/**
 * `optional` (default): the call runs with the session cookie, and a 401 means
 * the session is gone. `none`: anonymous endpoint (login, 2FA, password reset)
 * where a 401 is a credential error, not a lost session.
 */
export type AuthMode = 'optional' | 'none';

/**
 * CSRF guard: the API rejects cookie-authenticated writes without this header.
 * A cross-site form cannot set custom headers, and a cross-site `fetch` that
 * tries needs a CORS preflight the API never grants.
 */
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'fractachain';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  auth?: AuthMode;
  /** Override the client default; on-chain operations need far more than reads. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Standard `{ success, data, message }` envelope of the Fractachain API. */
export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  issues?: ApiIssue[];
}

export interface IHttpClient {
  /** Raw JSON body, for endpoints that answer outside `data` (`/api/auth/*`). */
  send<TBody extends ApiEnvelope = ApiEnvelope>(path: string, options?: RequestOptions): Promise<TBody>;
  /** `data` of a GET envelope. */
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  /** `data` of a POST envelope. */
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T>;
  /** Binary download from the API (sent with the session cookie). */
  blob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Blob>;
  /** Absolute URL for a path, e.g. to show it or open it. */
  url(path: string): string;
}

/** Reacts to a 401 on an authenticated request (clear the session, send the user to login). */
export interface IUnauthorizedHandler {
  onUnauthorized(): void;
}

/** 403 codes that describe the account, not the request: surfaced app-wide. */
export type PolicyViolationCode = 'TWO_FACTOR_REQUIRED' | 'EMAIL_NOT_VERIFIED';
export const POLICY_VIOLATION_CODES: ReadonlySet<string> = new Set<PolicyViolationCode>([
  'TWO_FACTOR_REQUIRED',
  'EMAIL_NOT_VERIFIED',
]);

export function isPolicyViolationCode(code: unknown): code is PolicyViolationCode {
  return typeof code === 'string' && POLICY_VIOLATION_CODES.has(code);
}

/** Learns about account-level refusals (e.g. admin without 2FA) so the UI can explain them once. */
export interface IPolicyViolationHandler {
  onPolicyViolation(code: PolicyViolationCode, message: string): void;
}

/** Copy the transport needs, injected so the HTTP layer stays locale-agnostic. */
export interface HttpMessages {
  network(): string;
  timeout(): string;
  badResponse(): string;
  rateLimited(): string;
  failed(): string;
}
