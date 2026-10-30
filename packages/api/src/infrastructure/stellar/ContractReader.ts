import {
  Account,
  Address,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import type { StellarClients } from './StellarClients';

/**
 * Simulation source for read-only calls. Simulation never checks the source
 * account's existence or sequence, so no funded account (and no key) is needed.
 * Same account the SDK's contract client uses for read-only calls.
 */
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** The contract exists but does not export the function (older WASM). */
export class MissingContractFunctionError extends Error {
  constructor(
    readonly contractId: string,
    readonly fn: string,
  ) {
    super(`${contractId} no exporta ${fn}()`);
  }
}

/** No contract instance with that ID on this network. */
export class ContractNotFoundError extends Error {
  constructor(readonly contractId: string) {
    super(`No hay un contrato ${contractId} en esta red`);
  }
}

/** The simulation failed (contract panic, missing entry, RPC error). */
export class ContractReadError extends Error {
  constructor(
    readonly contractId: string,
    readonly fn: string,
    readonly reason: string,
  ) {
    super(`${fn}() en ${contractId}: ${reason}`);
  }
}

/** Read-only access to contract functions. Implementations never sign. */
export interface IContractReader {
  /** Simulates `fn(...args)` and returns the decoded result (`scValToNative`). */
  call<T = unknown>(contractId: string, fn: string, args?: xdr.ScVal[]): Promise<T>;
}

/** Argument helpers so callers don't import the SDK's encoders. */
export const arg = {
  address: (value: string): xdr.ScVal => new Address(value).toScVal(),
  u64: (value: number | bigint): xdr.ScVal => nativeToScVal(BigInt(value), { type: 'u64' }),
};

const MISSING_FUNCTION = /non-existent contract function|function not found/i;
const MISSING_INSTANCE = /non-existing value for contract instance|contract instance.*not found/i;

/** `IContractReader` over Soroban RPC `simulateTransaction`. */
export class RpcContractReader implements IContractReader {
  constructor(
    private readonly clients: StellarClients,
    private readonly timeoutMs = 20_000,
  ) {}

  async call<T = unknown>(contractId: string, fn: string, args: xdr.ScVal[] = []): Promise<T> {
    const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
      fee: '100',
      networkPassphrase: this.clients.networkPassphrase(),
    })
      .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
      .setTimeout(30)
      .build();

    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await withTimeout(this.clients.rpc().simulateTransaction(tx), this.timeoutMs);
    } catch (err) {
      throw new ContractReadError(contractId, fn, err instanceof Error ? err.message : String(err));
    }
    if (rpc.Api.isSimulationError(sim)) {
      if (MISSING_FUNCTION.test(sim.error)) throw new MissingContractFunctionError(contractId, fn);
      if (MISSING_INSTANCE.test(sim.error)) throw new ContractNotFoundError(contractId);
      throw new ContractReadError(contractId, fn, firstLine(sim.error));
    }
    const retval = sim.result?.retval;
    if (!retval) throw new ContractReadError(contractId, fn, 'la simulación no devolvió resultado');
    return scValToNative(retval) as T;
  }
}

function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim()) ?? text;
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta del RPC en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
