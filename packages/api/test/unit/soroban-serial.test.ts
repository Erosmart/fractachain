import { Keypair, Operation, Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { SorobanGateway } from '../../src/infrastructure/stellar/SorobanGateway';

/** Fake RPC that records how many transactions of one source are in flight at once. */
function fakeClients() {
  let inFlight = 0;
  let maxInFlight = 0;
  let seq = 100n;
  const rpc = {
    async getAccount(id: string) {
      const { Account } = await import('@stellar/stellar-sdk');
      return new Account(id, String(seq));
    },
    async prepareTransaction(tx: unknown) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      return tx;
    },
    async sendTransaction() {
      seq++;
      return { status: 'PENDING', hash: `h${seq}` };
    },
    async pollTransaction() {
      inFlight--;
      return { status: 'SUCCESS' };
    },
  };
  return {
    clients: { rpc: () => rpc, networkPassphrase: () => Networks.TESTNET, rpcUrlValue: () => 'https://rpc' },
    max: () => maxInFlight,
  };
}

describe('SorobanGateway source serialization', () => {
  it('never has two transactions of the same platform account in flight', async () => {
    const fake = fakeClients();
    const gateway = new SorobanGateway(fake.clients as never, { load: () => null } as never);
    const admin = Keypair.random();
    const op = Operation.uploadContractWasm({ wasm: Buffer.from([0, 97, 115, 109]) });
    const results = await Promise.all([
      gateway.submitHostFunction(op, admin),
      gateway.submitHostFunction(op, admin),
      gateway.submitHostFunction(op, admin),
    ]);
    expect(fake.max()).toBe(1);
    expect(new Set(results.map((r) => r.hash)).size).toBe(3);
  });
});
