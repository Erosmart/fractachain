import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/core/auth/SessionStore';
import { normalizeUser } from '@/core/auth/SessionUser';
import { LocalStorageSessionCache, MemorySessionCache } from '@/core/auth/SessionCache';
import { Store } from '@/core/store/Store';

class Counter extends Store<{ n: number }> {
  inc() {
    this.setState((s) => ({ n: s.n + 1 }));
  }
  same() {
    this.setState((s) => s);
  }
}

describe('Store', () => {
  it('notifies subscribers on change and stops after unsubscribe', () => {
    const store = new Counter({ n: 0 });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.inc();
    expect(store.getSnapshot().n).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.inc();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('skips notifications when the state object is unchanged', () => {
    const store = new Counter({ n: 0 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.same();
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns a stable snapshot between changes (useSyncExternalStore contract)', () => {
    const store = new Counter({ n: 0 });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});

describe('SessionStore', () => {
  afterEach(() => vi.useRealTimers());
  const user = normalizeUser({
    id: 'u1',
    email: 'a@b.c',
    name: 'Ana',
    custodyMode: 'SELF',
    kycStatus: 'APPROVED',
  });

  it('hydrates the cached user (never a token)', () => {
    const cache = new MemorySessionCache();
    cache.save({ user, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const store = new SessionStore(cache);
    expect(store.getSnapshot().isLoading).toBe(true);
    store.hydrate();
    expect(store.getSnapshot()).toMatchObject({ isLoading: false, user: { id: 'u1' } });
    expect(store.isAuthenticated()).toBe(true);
    expect(store.getSnapshot()).not.toHaveProperty('token');
  });

  it('discards an expired session on hydrate and on read', () => {
    let now = 1_000_000;
    const cache = new MemorySessionCache();
    cache.save({ user, expiresAt: new Date(now - 1).toISOString() });
    const store = new SessionStore(cache, () => now);
    store.hydrate();
    expect(store.isAuthenticated()).toBe(false);
    expect(cache.load()).toBeNull();

    store.setSession(user, new Date(now + 10).toISOString());
    expect(store.isAuthenticated()).toBe(true);
    now += 11;
    expect(store.isAuthenticated()).toBe(false);
    expect(store.getSnapshot().user).toBeNull();
  });

  it('clears everything on 401 and finishes loading even when nobody was signed in', () => {
    const cache = new MemorySessionCache();
    const store = new SessionStore(cache);
    store.onUnauthorized();
    expect(store.getSnapshot().isLoading).toBe(false);
    store.setSession(user, null);
    store.setRevealedSecret('S...');
    store.setPendingTwoFactor({ challenge: 'c', expiresAt: null });
    store.onUnauthorized();
    expect(store.getSnapshot()).toMatchObject({
      user: null,
      revealedSecret: null,
      pendingTwoFactor: null,
      isLoading: false,
    });
    expect(cache.load()).toBeNull();
  });

  it('records account policy refusals and lets the UI dismiss them', () => {
    const store = new SessionStore(new MemorySessionCache());
    store.onPolicyViolation('TWO_FACTOR_REQUIRED', 'Activá 2FA');
    expect(store.getSnapshot().notice).toEqual({ code: 'TWO_FACTOR_REQUIRED', message: 'Activá 2FA' });
    store.dismissNotice();
    expect(store.getSnapshot().notice).toBeNull();
  });

  it('does not create a session from updateUser when signed out', () => {
    const store = new SessionStore(new MemorySessionCache());
    store.updateUser(user);
    expect(store.getSnapshot().user).toBeNull();
  });
});

describe('LocalStorageSessionCache', () => {
  class FakeStorage implements Storage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    clear() {
      this.map.clear();
    }
    getItem(k: string) {
      return this.map.has(k) ? this.map.get(k)! : null;
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
    removeItem(k: string) {
      this.map.delete(k);
    }
    setItem(k: string, v: string) {
      this.map.set(k, String(v));
    }
  }
  const user = normalizeUser({ id: 'u1', email: 'a@b.c' });

  it('purges legacy bearer tokens and never writes one', () => {
    const storage = new FakeStorage();
    storage.setItem('fc_auth_token', 'fc1.legacy');
    const cache = new LocalStorageSessionCache(storage);
    expect(storage.getItem('fc_auth_token')).toBeNull();
    cache.save({ user, expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(cache.load()).toMatchObject({ user: { id: 'u1' }, expiresAt: '2099-01-01T00:00:00.000Z' });
    expect([...Array(storage.length).keys()].map((i) => storage.key(i))).toEqual([
      'fc_auth_user',
      'fc_auth_expires',
    ]);
    storage.setItem('fc_auth_token', 'again');
    cache.clear();
    expect(storage.length).toBe(0);
  });
});

describe('normalizeUser', () => {
  it('degrades unknown payloads to safe defaults', () => {
    const u = normalizeUser({
      uid: 'x',
      custodialWallet: 'GABC',
      kycStatus: 'WEIRD',
      custodyMode: 'nope',
      holdings: 'no',
    });
    expect(u).toMatchObject({
      id: 'x',
      publicKey: 'GABC',
      kycStatus: 'UNREGISTERED',
      custodyMode: null,
      holdings: [],
      isAdmin: false,
    });
    expect(normalizeUser(null).id).toBe('');
  });
});
