import {
  ApiError,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  isPolicyViolationCode,
  type ApiEnvelope,
  type HttpMessages,
  type IHttpClient,
  type IPolicyViolationHandler,
  type IUnauthorizedHandler,
  type RequestOptions,
} from './HttpClient';

export interface FetchHttpClientDeps {
  /** Resolved per request: the base URL depends on the page host (LAN rewrite). */
  baseUrl: () => string;
  messages: HttpMessages;
  unauthorized?: IUnauthorizedHandler;
  policy?: IPolicyViolationHandler;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

/**
 * `fetch`-based implementation of {@link IHttpClient}.
 *
 * Authentication rides on the `fc_session` cookie (HttpOnly, SameSite=Strict)
 * that the API sets at login: JavaScript never sees a credential, so an XSS
 * cannot exfiltrate the session. Every request to the API carries the CSRF
 * header; nothing is ever attached to third-party URLs.
 */
export class FetchHttpClient implements IHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly deps: FetchHttpClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.defaultTimeoutMs = deps.defaultTimeoutMs ?? 30_000;
  }

  url(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.deps.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async send<TBody extends ApiEnvelope = ApiEnvelope>(
    path: string,
    options: RequestOptions = {},
  ): Promise<TBody> {
    const response = await this.execute(path, options, 'application/json');
    const raw = await response.text();
    let body: TBody;
    try {
      body = (raw ? JSON.parse(raw) : {}) as TBody;
    } catch {
      throw new ApiError(this.deps.messages.badResponse(), response.status, 'BAD_RESPONSE');
    }
    if (!response.ok || body.success === false) {
      const message = body.message || body.error || this.fallbackMessage(response.status);
      if (response.status === 403 && isPolicyViolationCode(body.code))
        this.deps.policy?.onPolicyViolation(body.code, message);
      throw new ApiError(message, response.status, body.code, body.issues);
    }
    return body;
  }

  async get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    const body = await this.send<ApiEnvelope<T>>(path, { ...options, method: 'GET' });
    return body.data as T;
  }

  async post<T>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<T> {
    const envelope = await this.send<ApiEnvelope<T>>(path, { ...options, method: 'POST', body: body ?? {} });
    return envelope.data as T;
  }

  async blob(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<Blob> {
    const response = await this.execute(path, { ...options, method: 'GET' }, '*/*');
    if (!response.ok) throw new ApiError(this.fallbackMessage(response.status), response.status);
    return response.blob();
  }

  private async execute(path: string, options: RequestOptions, accept: string): Promise<Response> {
    const method = options.method ?? 'GET';
    const target = this.url(path);
    const toApi = this.isApiOrigin(target);
    const headers: Record<string, string> = { Accept: accept };
    if (toApi) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
    const hasBody = method !== 'GET' && options.body !== undefined;
    if (hasBody) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      const response = await this.fetchImpl(target, {
        method,
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        // The session cookie only ever travels to our own origin.
        credentials: 'same-origin',
      });
      if (response.status === 401 && toApi && options.auth !== 'none')
        this.deps.unauthorized?.onUnauthorized();
      return response;
    } catch (err) {
      if (timedOut) throw new ApiError(this.deps.messages.timeout(), 0, 'TIMEOUT');
      if (options.signal?.aborted) throw err;
      throw new ApiError(this.deps.messages.network(), 0, 'NETWORK');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  }

  private isApiOrigin(target: string): boolean {
    try {
      const base = this.deps.baseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
      return new URL(target, base).origin === new URL(base).origin;
    } catch {
      return false;
    }
  }

  private fallbackMessage(status: number): string {
    if (status === 429) return this.deps.messages.rateLimited();
    if (status >= 500 || status === 0) return this.deps.messages.badResponse();
    return this.deps.messages.failed();
  }
}
