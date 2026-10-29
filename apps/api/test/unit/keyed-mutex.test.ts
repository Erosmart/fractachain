import { describe, expect, it } from 'vitest';
import { KeyedMutex } from '../../src/shared/KeyedMutex';

describe('KeyedMutex', () => {
  it('serializes tasks on the same key and keeps other keys parallel', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let pending = 1;
    const payout = (tag: string) =>
      mutex.run('acct:listing', async () => {
        const seen = pending; // read
        await sleep(10); // network round-trip
        if (seen > 0) {
          log.push(`${tag}:paid`);
          pending = 0; // write
        } else {
          log.push(`${tag}:nothing`);
        }
      });
    const other = mutex.run('other', async () => {
      log.push('other');
    });
    await Promise.all([payout('a'), payout('b'), other]);
    expect(log.filter((l) => l.endsWith(':paid'))).toHaveLength(1);
    expect(log).toContain('b:nothing');
    expect(log[0]).toBe('other');
  });

  it('releases the lock when a task fails', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.run('k', async () => 42)).resolves.toBe(42);
  });
});
