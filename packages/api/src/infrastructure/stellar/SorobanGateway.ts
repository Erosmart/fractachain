import { createHash } from 'crypto';
import { Keypair, Transaction, TransactionBuilder, contract, type xdr } from '@stellar/stellar-sdk';
import { isContractId } from '../../domain/stellar/StellarAddress';
import {
  AppError,
  DomainError,
  NotConfiguredError,
  UpstreamError,
  ValidationError,
} from '../../shared/errors';
import type { IDeploymentRegistry } from './DeploymentRegistry';
import type { StellarClients } from './StellarClients';

export const SOROBAN_FEE = '1000000';
export const SOROBAN_TIMEOUT = 60;

/** Contract client with dynamic method access (bindings are generated at runtime from the WASM spec). */
export type AnyClient = contract.Client & {
  [method: string]: (
    args?: Record<string, unknown>,
    opts?: contract.MethodOptions,
  ) => Promise<contract.AssembledTransaction<unknown>>;
};

export interface InvokeResult {
  hash: string | null;
  result: unknown;
}

/** Contract errors → messages an operator or investor can act on. */
export function mapSorobanError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  const table: [RegExp, string][] = [
    [
      /kyc not verified|buyer kyc/,
      'El inversor no está verificado on-chain. El admin tiene que pasar KYC al contrato.',
    ],
    [/not open|deadline passed/, 'La licitación on-chain no está abierta o ya venció el plazo.'],
    [/exceeds hard cap/, 'El aporte supera el hard cap del contrato.'],
    [/divisible|whole number/, 'El monto tiene que ser un múltiplo del precio por unidad.'],
    [
      /cannot finalize yet/,
      'Todavía no se puede cerrar: hace falta llegar al hard cap o que venza el deadline.',
    ],
    [
      /not in open state/,
      'La licitación on-chain ya no está abierta (finalize ya corrió o el estado no es Open).',
    ],
    [
      /refunds only available/,
      'El reembolso on-chain solo existe si finalize() dejó la emisión en Failed (no se llegó al soft cap).',
    ],
    [
      /no balance to refund/,
      'Esta wallet no tiene saldo para reembolsar en el contrato (ya se reembolsó o no aportó).',
    ],
    [
      /proceeds already withdrawn|only withdrawable after a successful/,
      'Los fondos ya se pagaron a la wallet de la empresa, o la emisión no cerró en Successful.',
    ],
    [/insufficient|balance/, 'Saldo insuficiente en la wallet para el aporte y las fees de Soroban.'],
    [/already initialized/, 'Ese contrato ya está inicializado.'],
  ];
  for (const [pattern, message] of table) {
    if (pattern.test(text)) return new DomainError(message);
  }
  // Unknown chain failure: still surfaced (operators need the RPC's reason), as a 502.
  return new UpstreamError(raw.length > 600 ? `${raw.slice(0, 600)}…` : raw);
}

/**
 * Soroban RPC access: contract clients, invocations, read-only simulations,
 * deploys, and relaying invocations signed by an investor's wallet.
 */
export class SorobanGateway {
  constructor(
    private readonly clients: StellarClients,
    private readonly deployments: IDeploymentRegistry,
  ) {}

  /** Signer adapter for the SDK's contract client. */
  private signers(kp: Keypair) {
    const passphrase = this.clients.networkPassphrase();
    return {
      signTransaction: async (unsignedXdr: string) => {
        const tx = TransactionBuilder.fromXDR(unsignedXdr, passphrase) as Transaction;
        tx.sign(kp);
        return { signedTxXdr: tx.toXDR() };
      },
      // SDK ≥14 hands signAuthEntry the HashIDPreimage and expects the raw
      // signature back; the SDK assembles the entry itself.
      signAuthEntry: async (preimageXdr: string) => {
        const digest = createHash('sha256').update(Buffer.from(preimageXdr, 'base64')).digest();
        return {
          signedAuthEntry: Buffer.from(kp.sign(digest)).toString('base64'),
          signerAddress: kp.publicKey(),
        };
      },
    };
  }

  private options(kp?: Keypair, contractId?: string, publicKey?: string): contract.ClientOptions {
    const signers = kp ? this.signers(kp) : undefined;
    return {
      contractId: contractId || 'C'.padEnd(56, 'A'),
      networkPassphrase: this.clients.networkPassphrase(),
      rpcUrl: this.clients.rpcUrlValue(),
      allowHttp: this.clients.rpcUrlValue().startsWith('http://'),
      publicKey: publicKey ?? kp?.publicKey(),
      signTransaction: signers?.signTransaction,
      signAuthEntry: signers?.signAuthEntry,
    };
  }

  private static methodOpts(): contract.MethodOptions {
    return { fee: SOROBAN_FEE, timeoutInSeconds: SOROBAN_TIMEOUT, restore: true };
  }

  async client(contractId: string, kp?: Keypair): Promise<AnyClient> {
    if (!isContractId(contractId)) throw new ValidationError(`ID de contrato inválido: ${contractId}`);
    try {
      return (await contract.Client.from(this.options(kp, contractId))) as AnyClient;
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  async invoke(
    client: AnyClient,
    method: string,
    args: Record<string, unknown> = {},
    extraSigners: Keypair[] = [],
  ): Promise<InvokeResult> {
    try {
      const fn = client[method];
      const tx =
        Object.keys(args).length === 0
          ? await fn(SorobanGateway.methodOpts())
          : await fn(args, SorobanGateway.methodOpts());
      for (const signer of extraSigners) {
        if (tx.needsNonInvokerSigningBy().includes(signer.publicKey())) {
          await tx.signAuthEntries({
            address: signer.publicKey(),
            signAuthEntry: this.signers(signer).signAuthEntry,
          });
        }
      }
      const sent = await tx.signAndSend();
      const resp = sent.getTransactionResponse as
        { status?: string; diagnosticEventsXdr?: string[] } | undefined;
      if (resp?.status === 'FAILED') {
        // `sent.result` throws an opaque TypeError on a failed tx; surface the
        // contract's own diagnostic strings instead.
        const diag = (resp.diagnosticEventsXdr || [])
          .map((e) =>
            Buffer.from(e, 'base64')
              .toString('latin1')
              .replace(/[^\x20-\x7e]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim(),
          )
          .filter((s) => s.length > 10)
          .join(' | ');
        throw new Error(`La transacción falló en la red.${diag ? ` Eventos: ${diag}` : ''}`);
      }
      let result: unknown = null;
      try {
        result = sent.result;
      } catch {
        result = null;
      }
      return { hash: SorobanGateway.sentHash(sent), result };
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /** Read-only call: simulate and return the decoded result. */
  async read<T>(client: AnyClient, method: string, args: Record<string, unknown> = {}): Promise<T> {
    try {
      const fn = client[method];
      const opts = { ...SorobanGateway.methodOpts(), simulate: true };
      const tx = Object.keys(args).length === 0 ? await fn(opts) : await fn(args, opts);
      return tx.result as T;
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /**
   * Builds and simulates an invocation the investor's own wallet will sign.
   * The wallet is the transaction source, so its signature satisfies
   * `require_auth` — the backend never sees the key.
   */
  async unsignedInvocationXdr(
    contractId: string,
    invoker: string,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    try {
      const client = (await contract.Client.from(this.options(undefined, contractId, invoker))) as AnyClient;
      const fn = client[method];
      const tx =
        Object.keys(args).length === 0
          ? await fn(SorobanGateway.methodOpts())
          : await fn(args, SorobanGateway.methodOpts());
      const pending = tx.needsNonInvokerSigningBy();
      if (pending.length) throw new DomainError(`La transacción necesita la firma de ${pending.join(', ')}`);
      return tx.toXDR();
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  parseTransaction(signedXdr: string): Transaction {
    try {
      const tx = TransactionBuilder.fromXDR(signedXdr, this.clients.networkPassphrase());
      if (!(tx instanceof Transaction)) throw new Error('fee bump');
      return tx;
    } catch {
      throw new ValidationError('El XDR firmado no es una transacción válida para esta red');
    }
  }

  /** Relays a Soroban transaction already signed by the investor and waits for it to settle. */
  async submitSigned(tx: Transaction): Promise<string> {
    const srv = this.clients.rpc();
    try {
      const sent = await srv.sendTransaction(tx);
      if (sent.status === 'ERROR') {
        throw new Error(`La red rechazó la transacción: ${JSON.stringify(sent.errorResult)}`);
      }
      const settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
      if (settled.status !== 'SUCCESS') throw new Error(`La transacción terminó en ${settled.status}`);
      return sent.hash;
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  async deployFromWasmHash(
    wasmHash: Buffer | string,
    deployer: Keypair,
  ): Promise<{ contractId: string; hash: string | null }> {
    try {
      return await this.deploy(wasmHash, deployer);
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  private async deploy(
    wasmHash: Buffer | string,
    deployer: Keypair,
  ): Promise<{ contractId: string; hash: string | null }> {
    const assembled = await contract.Client.deploy(null, {
      ...this.options(deployer),
      wasmHash,
      format: 'hex',
      address: deployer.publicKey(),
      fee: SOROBAN_FEE,
      timeoutInSeconds: SOROBAN_TIMEOUT,
      restore: true,
    } as Parameters<typeof contract.Client.deploy>[1]);
    const sent = await assembled.signAndSend();
    const created = sent.result as contract.Client;
    const contractId = created.options.contractId;
    if (!isContractId(contractId)) throw new UpstreamError('El deploy no devolvió un contract id válido');
    return { contractId, hash: SorobanGateway.sentHash(sent) };
  }

  async wasmHashOf(contractId: string): Promise<string> {
    try {
      const wasm = await this.clients.rpc().getContractWasmByContractId(contractId);
      return createHash('sha256').update(wasm).digest('hex');
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /**
   * Reads an optional view; `undefined` when the deployed WASM predates it
   * (the call fails at simulation with "non-existent contract function").
   */
  async readOptional<T>(
    client: AnyClient,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<T | undefined> {
    if (typeof client[method] !== 'function') return undefined;
    try {
      return await this.read<T>(client, method, args);
    } catch {
      return undefined;
    }
  }

  xlmSac(): string {
    const id = this.deployments.load()?.xlmSac;
    if (!isContractId(id)) throw new NotConfiguredError('Falta xlmSac en deployments/testnet.json');
    return id;
  }

  factoryId(): string {
    const id = this.deployments.load()?.factory;
    if (!isContractId(id)) throw new NotConfiguredError('Falta factory en deployments/testnet.json');
    return id;
  }

  /**
   * Builds, simulates (footprint + fees), signs and submits a single Soroban
   * host-function operation (WASM upload, Stellar Asset Contract deploy…).
   */
  async submitHostFunction(
    op: xdr.Operation,
    signer: Keypair,
  ): Promise<{ hash: string; returnValue?: xdr.ScVal }> {
    const srv = this.clients.rpc();
    try {
      const source = await srv.getAccount(signer.publicKey());
      const tx = new TransactionBuilder(source, {
        fee: SOROBAN_FEE,
        networkPassphrase: this.clients.networkPassphrase(),
      })
        .addOperation(op)
        .setTimeout(SOROBAN_TIMEOUT)
        .build();
      const prepared = await srv.prepareTransaction(tx);
      prepared.sign(signer);
      const sent = await srv.sendTransaction(prepared);
      if (sent.status === 'ERROR')
        throw new Error(`La red rechazó la transacción: ${JSON.stringify(sent.errorResult)}`);
      const settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
      if (settled.status !== 'SUCCESS') throw new Error(`La transacción terminó en ${settled.status}`);
      return { hash: sent.hash, returnValue: (settled as { returnValue?: xdr.ScVal }).returnValue };
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  async latestLedger(): Promise<number> {
    return (await this.clients.rpc().getLatestLedger()).sequence;
  }

  private static sentHash(sent: contract.SentTransaction<unknown>): string | null {
    const send = sent.sendTransactionResponse?.hash;
    if (send) return send;
    const got = sent.getTransactionResponse as { txHash?: string } | undefined;
    return got?.txHash || null;
  }
}
