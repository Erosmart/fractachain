import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@/core/auth/SessionStore';
import { normalizeUser } from '@/core/auth/SessionUser';
import { MemoryTokenStorage } from '@/core/auth/TokenStorage';
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
  const user = normalizeUser({ id: 'u1', email: 'a@b.c', name: 'Ana', custodyMode: 'SELF', kycStatus: 'APPROVED' });

  it('hydrates a persisted session and exposes its token', () => {
    const storage = new MemoryTokenStorage();
    storage.save({ token: 't1', user, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const store = new SessionStore(storage);
    expect(store.getSnapshot().isLoading).toBe(true);
    store.hydrate();
    expect(store.getSnapshot().isLoading).toBe(false);
    expect(store.getToken()).toBe('t1');
  });

  it('discards an expired session on hydrate and on read', () => {
    let now = 1_000_000;
    const storage = new MemoryTokenStorage();
    storage.save({ token: 'old', user, expiresAt: new Date(now - 1).toISOString() });
    const store = new SessionStore(storage, () => now);
    store.hydrate();
    expect(store.getToken()).toBeNull();
    expect(storage.load()).toBeNull();

    store.setSession('fresh', user, new Date(now + 10).toISOString());
    expect(store.getToken()).toBe('fresh');
    now += 11;
    expect(store.getToken()).toBeNull();
    expect(store.getSnapshot().user).toBeNull();
  });

  it('clears everything on 401', () => {
    const storage = new MemoryTokenStorage();
    const store = new SessionStore(storage);
    store.setSession('t', user, null);
    store.setRevealedSecret('S...');
    store.onUnauthorized();
    expect(store.getSnapshot()).toMatchObject({ user: null, token: null, revealedSecret: null, isLoading: false });
    expect(storage.load()).toBeNull();
  });
});

describe('normalizeUser', () => {
  it('degrades unknown payloads to safe defaults', () => {
    const u = normalizeUser({ uid: 'x', custodialWallet: 'GABC', kycStatus: 'WEIRD', custodyMode: 'nope', holdings: 'no' });
    expect(u).toMatchObject({ id: 'x', publicKey: 'GABC', kycStatus: 'UNREGISTERED', custodyMode: null, holdings: [], isAdmin: false });
    expect(normalizeUser(null).id).toBe('');
  });
});
