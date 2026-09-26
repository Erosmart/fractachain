import {
  Address,
  Keypair,
  StrKey,
  Transaction,
  TransactionBuilder,
  authorizeEntry,
  contract,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { getTestnetConfig } from '../admin/testnet';
import { loadTestnetDeployment } from './deployment';

export const STROOPS_PER_UNIT = 10_000_000n;
export const SOROBAN_FEE = '1000000';
export const SOROBAN_TIMEOUT = 60;

export type AnyClient = contract.Client & {
  [method: string]: (
    args?: Record<string, unknown>,
    opts?: contract.MethodOptions,
  ) => Promise<contract.AssembledTransaction<unknown>>;
};

export function isLiveContractId(id?: string | null): boolean {
  if (!id) return false;
  try {
    return StrKey.isValidContract(id);
  } catch {
    return false;
  }
}

export function toStroops(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Monto inválido');
  }
  return BigInt(Math.round(amount * Number(STROOPS_PER_UNIT)));
}

export function fromStroops(stroops: bigint | number | string): number {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  return Number(n) / Number(STROOPS_PER_UNIT);
}

let rpcClient: rpc.Server | null = null;
let rpcUrl = '';

export function rpcServer() {
  const url = getTestnetConfig().rpcUrl;
  if (!rpcClient || rpcUrl !== url) {
    rpcClient = new rpc.Server(url);
    rpcUrl = url;
  }
  return rpcClient;
}

export function networkPassphrase() {
  return getTestnetConfig().networkPassphrase;
}

export function nodeSigners(kp: Keypair) {
  const passphrase = networkPassphrase();
  return {
    publicKey: kp.publicKey(),
    signTransaction: async (unsignedXdr: string) => {
      const tx = TransactionBuilder.fromXDR(unsignedXdr, passphrase);
      (tx as Transaction).sign(kp);
      return { signedTxXdr: tx.toXDR() };
    },
    signAuthEntry: async (entryXdr: string) => {
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, 'base64');
      const latest = await rpcServer().getLatestLedger();
      const signed = await authorizeEntry(entry, kp, latest.sequence + 100, passphrase);
      return { signedAuthEntry: signed.toXDR('base64') };
    },
  };
}

export function clientOptions(kp?: Keypair, contractId?: string): contract.ClientOptions {
  const signers = kp ? nodeSigners(kp) : undefined;
  return {
    contractId: contractId || 'C'.padEnd(56, 'A'),
    networkPassphrase: networkPassphrase(),
    rpcUrl: getTestnetConfig().rpcUrl,
    publicKey: kp?.publicKey(),
    signTransaction: signers?.signTransaction,
    signAuthEntry: signers?.signAuthEntry,
  };
}

export async function contractClient(contractId: string, kp?: Keypair): Promise<AnyClient> {
  if (!isLiveContractId(contractId)) {
    throw new Error(`ID de contrato inválido: ${contractId}`);
  }
  return (await contract.Client.from(clientOptions(kp, contractId))) as AnyClient;
}

export function methodOpts(): contract.MethodOptions {
  return {
    fee: SOROBAN_FEE,
    timeoutInSeconds: SOROBAN_TIMEOUT,
    restore: true,
  };
}

export function sentHash(sent: contract.SentTransaction<unknown>): string | null {
  const send = sent.sendTransactionResponse?.hash;
  if (send) return send;
  const got = sent.getTransactionResponse as { txHash?: string } | undefined;
  return got?.txHash || null;
}

export function mapSorobanError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  if (/kyc not verified|buyer kyc/.test(text)) {
    return new Error('El inversor no está verificado on-chain. El admin tiene que pasar KYC al contrato.');
  }
  if (/not open|deadline passed/.test(text)) {
    return new Error('La licitación on-chain no está abierta o ya venció el plazo.');
  }
  if (/exceeds hard cap/.test(text)) {
    return new Error('El aporte supera el hard cap del contrato.');
  }
  if (/divisible|whole number/.test(text)) {
    return new Error('El monto tiene que ser un múltiplo del precio por unidad.');
  }
  if (/cannot finalize yet/.test(text)) {
    return new Error('Todavía no se puede cerrar: hace falta llegar al hard cap o que venza el deadline.');
  }
  if (/not in open state/.test(text)) {
    return new Error('La licitación on-chain ya no está abierta (finalize ya corrió o el estado no es Open).');
  }
  if (/refunds only available/.test(text)) {
    return new Error('El reembolso on-chain solo existe si finalize() dejó la emisión en Failed (no se llegó al soft cap).');
  }
  if (/no balance to refund/.test(text)) {
    return new Error('Esta wallet no tiene saldo para reembolsar en el contrato (ya se reembolsó o no aportó).');
  }
  if (/proceeds already withdrawn|only withdrawable after a successful/.test(text)) {
    return new Error('Los fondos ya se pagaron a la wallet de la empresa, o la emisión no cerró en Successful.');
  }
  if (/insufficient|balance/.test(text)) {
    return new Error('XLM insuficiente en la wallet para el aporte y las fees de Soroban.');
  }
  if (/already initialized/.test(text)) {
    return new Error('Ese contrato ya está inicializado.');
  }
  return err instanceof Error ? err : new Error(raw);
}

export async function invoke(
  client: AnyClient,
  method: string,
  args: Record<string, unknown> = {},
  extraSigners: Keypair[] = [],
): Promise<{ hash: string | null; result: unknown }> {
  try {
    const fn = client[method];
    const tx =
      Object.keys(args).length === 0
        ? await fn(methodOpts())
        : await fn(args, methodOpts());
    for (const signer of extraSigners) {
      const needed = tx.needsNonInvokerSigningBy();
      if (needed.includes(signer.publicKey())) {
        await tx.signAuthEntries({
          address: signer.publicKey(),
          signAuthEntry: nodeSigners(signer).signAuthEntry,
        });
      }
    }
    const sent = await tx.signAndSend();
    return { hash: sentHash(sent), result: sent.result };
  } catch (err) {
    throw mapSorobanError(err);
  }
}

/**
 * Builds and simulates an invocation the investor's own wallet will sign.
 *
 * The backend never sees the key: the wallet is the transaction source, so
 * its signature is what satisfies `require_auth` inside the contract — no
 * separate authorization entry has to travel back and forth.
 */
export async function unsignedInvocationXdr(
  contractId: string,
  invoker: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  try {
    const client = (await contract.Client.from({
      ...clientOptions(undefined, contractId),
      publicKey: invoker,
    })) as AnyClient;
    const fn = client[method];
    const tx =
      Object.keys(args).length === 0 ? await fn(methodOpts()) : await fn(args, methodOpts());
    const pending = tx.needsNonInvokerSigningBy();
    if (pending.length) {
      throw new Error(`La transacción necesita la firma de ${pending.join(', ')}`);
    }
    return tx.toXDR();
  } catch (err) {
    throw mapSorobanError(err);
  }
}

/** Relays a Soroban transaction already signed by the investor's wallet. */
export async function submitSignedSorobanXdr(signedXdr: string): Promise<string> {
  const srv = rpcServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase()) as Transaction;
  try {
    const sent = await srv.sendTransaction(tx);
    if (sent.status === 'ERROR') {
      throw new Error(`La red rechazó la transacción: ${JSON.stringify(sent.errorResult)}`);
    }
    const settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
    if (settled.status !== 'SUCCESS') {
      throw new Error(`La transacción terminó en ${settled.status}`);
    }
    return sent.hash;
  } catch (err) {
    throw mapSorobanError(err);
  }
}

export async function read<T>(
  client: AnyClient,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const fn = client[method];
  const opts = { ...methodOpts(), simulate: true };
  const tx = Object.keys(args).length === 0 ? await fn(opts) : await fn(args, opts);
  return tx.result as T;
}

export async function deployFromWasmHash(
  wasmHash: Buffer | string,
  deployer: Keypair,
): Promise<{ contractId: string; hash: string | null; client: AnyClient }> {
  const assembled = await contract.Client.deploy(null, {
    ...clientOptions(deployer),
    wasmHash,
    format: 'hex',
    address: deployer.publicKey(),
    fee: SOROBAN_FEE,
    timeoutInSeconds: SOROBAN_TIMEOUT,
    restore: true,
  });
  const sent = await assembled.signAndSend();
  const created = sent.result as contract.Client;
  const contractId = created.options.contractId;
  if (!isLiveContractId(contractId)) {
    throw new Error('El deploy no devolvió un contract id válido');
  }
  return {
    contractId,
    hash: sentHash(sent),
    client: created as AnyClient,
  };
}

export async function wasmHashOf(contractId: string): Promise<string> {
  const wasm = await rpcServer().getContractWasmByContractId(contractId);
  const { createHash } = await import('crypto');
  return createHash('sha256').update(wasm).digest('hex');
}

export function xlmSac(): string {
  const id = loadTestnetDeployment()?.xlmSac;
  if (!isLiveContractId(id)) {
    throw new Error('Falta xlmSac en deployments/testnet.json');
  }
  return id!;
}

export function factoryId(): string {
  const id = loadTestnetDeployment()?.factory;
  if (!isLiveContractId(id)) {
    throw new Error('Falta factory en deployments/testnet.json');
  }
  return id!;
}

export { Address };
