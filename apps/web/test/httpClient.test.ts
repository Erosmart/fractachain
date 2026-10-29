import { describe, expect, it, vi } from 'vitest';
import { FetchHttpClient } from '@/core/http/FetchHttpClient';
import { ApiError } from '@/core/http/HttpClient';

const messages = {
  network: () => 'network down',
  timeout: () => 'too slow',
  badResponse: () => 'bad response',
  rateLimited: () => 'slow down',
  failed: () => 'failed',
};

function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>, token: string | null = 'tok') {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => responder(String(input), init ?? {}));
  const unauthorized = { onUnauthorized: vi.fn() };
  const client = new FetchHttpClient({
    baseUrl: () => 'http://api.test',
    tokens: { getToken: () => token },
    unauthorized,
    messages,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, fetchImpl, unauthorized };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('FetchHttpClient', () => {
  it('unwraps `data` and sends the bearer token to the API', async () => {
    const { client, fetchImpl } = setup(() => json(200, { success: true, data: { n: 1 } }));
    await expect(client.get<{ n: number }>('/api/x')).resolves.toEqual({ n: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://api.test/api/x');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('serializes POST bodies as JSON', async () => {
    const { client, fetchImpl } = setup(() => json(200, { success: true, data: null }));
    await client.post('/api/y', { a: 1 });
    const init = fetchImpl.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns `{ success:false }` envelopes into ApiError with code and issues', async () => {
    const { client } = setup(() =>
      json(400, { success: false, message: 'Monto inválido', code: 'VALIDATION_FAILED', issues: [{ path: 'amount', message: 'x' }] }),
    );
    const err = await client.post('/api/z', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Monto inválido', status: 400, code: 'VALIDATION_FAILED' });
    expect((err as ApiError).issues).toHaveLength(1);
  });

  it('reports a 401 on an authenticated call to the session handler', async () => {
    const { client, unauthorized } = setup(() => json(401, { success: false, message: 'No autenticado' }));
    await expect(client.get('/api/auth/me')).rejects.toMatchObject({ status: 401, isUnauthorized: true });
    expect(unauthorized.onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not end a session on a 401 to an anonymous call', async () => {
    const { client, unauthorized } = setup(() => json(401, { success: false, message: 'Credenciales inválidas' }), null);
    await expect(client.post('/api/auth/email', {})).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized.onUnauthorized).not.toHaveBeenCalled();
  });

  it('never leaks the token to another origin', async () => {
    const { client, fetchImpl } = setup(() => new Response(new Blob(['x']), { status: 200 }));
    await client.blob('https://evil.example/selfie.png');
    expect((fetchImpl.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('maps 429, non-JSON and network failures to readable messages', async () => {
    await expect(setup(() => json(429, {})).client.get('/a')).rejects.toMatchObject({ message: 'slow down', status: 429 });
    await expect(setup(() => new Response('<html>502</html>', { status: 502 })).client.get('/a')).rejects.toMatchObject({
      message: 'bad response',
      code: 'BAD_RESPONSE',
    });
    const offline = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.client.get('/a')).rejects.toMatchObject({ code: 'NETWORK', message: 'network down', isNetwork: true });
  });

  it('aborts slow requests with a timeout error', async () => {
    const { client } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    await expect(client.get('/slow', { timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT', message: 'too slow' });
  });
});
