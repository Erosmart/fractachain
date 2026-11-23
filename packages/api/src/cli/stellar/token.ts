import {
  Address,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  type xdr,
} from '@stellar/stellar-sdk';
import type { StellarContext } from './network';

/**
 * Read-only call to any contract, including Stellar Asset Contracts (which
 * have no WASM spec for the SDK's typed client): simulate a raw invocation.
 */
export async function simulateRead(
  ctx: StellarContext,
  contractId: string,
  fn: string,
  args: xdr.ScVal[],
  source: string,
): Promise<unknown> {
  const account = await ctx.rpc.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: '100000', networkPassphrase: ctx.preset.passphrase })
    .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
    .setTimeout(60)
    .build();
  const sim = await ctx.rpc.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`No se pudo leer ${fn}() de ${contractId}`);
  }
  return scValToNative(sim.result.retval);
}

/** `decimals()` of a token contract. */
export async function tokenDecimals(ctx: StellarContext, tokenId: string, source: string): Promise<number> {
  return Number(await simulateRead(ctx, tokenId, 'decimals', [], source));
}

/** Token balance of an address, in decimal units. */
export async function tokenBalance(
  ctx: StellarContext,
  tokenId: string,
  holder: string,
  decimals: number,
  source: string,
): Promise<number> {
  const raw = await simulateRead(
    ctx,
    tokenId,
    'balance',
    [nativeToScVal(Address.fromString(holder))],
    source,
  );
  return Number(BigInt(raw as bigint)) / 10 ** decimals;
}
