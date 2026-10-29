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
 * `optional` sends the session token when there is one (default);
 * `none` never does — for public endpoints that must not see credentials.
 */
export type AuthMode = 'optional' | 'none';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  auth?: AuthMode;
  /** Override the client default; on-chain operations need far more than reads. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Explicit bearer token, for calls made right after login before the store updates. */
  token?: string | null;
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
  /** Binary download (e.g. KYC selfies behind auth). */
  blob(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<Blob>;
  /** Absolute URL for a path, e.g. to show it or open it. */
  url(path: string): string;
}

/** Supplies the current session token without coupling the transport to the session store. */
export interface ITokenProvider {
  getToken(): string | null;
}

/** Reacts to a 401 on an authenticated request (clear the session, send the user to login). */
export interface IUnauthorizedHandler {
  onUnauthorized(): void;
}

/** Copy the transport needs, injected so the HTTP layer stays locale-agnostic. */
export interface HttpMessages {
  network(): string;
  timeout(): string;
  badResponse(): string;
  rateLimited(): string;
  failed(): string;
}
