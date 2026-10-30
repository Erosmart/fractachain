import { createHash } from 'crypto';
import {
  Account,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  authorizeEntry,
  contract,
  inspectAuthEntry,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { SAC_DECIMALS } from '../../domain/stellar/Amounts';
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
/** Validity window of a transaction handed to the investor's wallet to sign. */
export const WALLET_SIGN_TIMEOUT = 300;
/** Source used for read-only simulations (never signs, never needs to exist). */
const SIMULATION_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** A token contract as the platform shows it: identity + `decimals()`. */
export interface TokenInfo {
  contractId: string;
  /** Asset code ("XLM" for the native SAC). */
  code: string;
  /** Classic issuer, null for native. */
  issuer: string | null;
  decimals: number;
}

export type ChainTxStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_FOUND';

export interface SubmittedTx {
  hash: string;
  status: ChainTxStatus;
  ledger?: number;
}

/** The network executed the transaction and it failed (contract trap, bad auth…). */
export class TxFailedError extends AppError {
  constructor(message: string, hash: string | null) {
    super(message, 422, 'TX_FAILED', hash ? { hash } : undefined);
  }
}

/** Human-readable strings out of a failed transaction's diagnostic events. */
function diagnosticText(events: (string | xdr.DiagnosticEvent)[] | undefined): string {
  return (events || [])
    .map((e) =>
      (typeof e === 'string' ? Buffer.from(e, 'base64') : e.toXDR())
        .toString('latin1')
        .replace(/[^\x20-\x7e]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((text) => text.length > 10)
    .join(' | ');
}

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
  /** WASM hash → exported function names (WASMs are immutable, so this never goes stale). */
  private readonly specCache = new Map<string, Promise<ReadonlySet<string>>>();
  /** Token contract → identity and decimals (a SAC's never change). */
  private readonly tokenCache = new Map<string, Promise<TokenInfo>>();

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
    timeoutInSeconds: number = SOROBAN_TIMEOUT,
  ): Promise<string> {
    try {
      const client = (await contract.Client.from(this.options(undefined, contractId, invoker))) as AnyClient;
      const fn = client[method];
      const opts = { ...SorobanGateway.methodOpts(), timeoutInSeconds };
      const tx = Object.keys(args).length === 0 ? await fn(opts) : await fn(args, opts);
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
    const sent = await this.submitSignedDetailed(tx);
    if (sent.status !== 'SUCCESS') {
      throw new UpstreamError(
        'La transacción sigue pendiente en la red: consultá su estado en unos segundos',
        {
          hash: sent.hash,
        },
      );
    }
    return sent.hash;
  }

  /**
   * `sendTransaction` + `getTransaction` polling. A transaction the network
   * executed and failed throws `TxFailedError` (with its hash); one that is
   * still pending after ~30 s comes back as `PENDING`.
   */
  async submitSignedDetailed(tx: Transaction): Promise<SubmittedTx> {
    const srv = this.clients.rpc();
    let sent: rpc.Api.SendTransactionResponse;
    try {
      sent = await srv.sendTransaction(tx);
    } catch (err) {
      throw mapSorobanError(err);
    }
    if (sent.status === 'ERROR') {
      const code = sent.errorResult?.result.type ?? 'error';
      throw new TxFailedError(`La red rechazó la transacción (${code})`, null);
    }
    if (sent.status === 'TRY_AGAIN_LATER') {
      throw new UpstreamError('La red está congestionada: probá de nuevo en unos segundos');
    }
    let settled: rpc.Api.GetTransactionResponse;
    try {
      settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
    } catch (err) {
      throw mapSorobanError(err);
    }
    if (settled.status === 'SUCCESS') return { hash: sent.hash, status: 'SUCCESS', ledger: settled.ledger };
    if (settled.status === 'FAILED') {
      const diag = diagnosticText(settled.diagnosticEventsXdr);
      const friendly = mapSorobanError(new Error(diag || 'La transacción falló en la red'));
      throw new TxFailedError(friendly.message, sent.hash);
    }
    return { hash: sent.hash, status: 'PENDING' };
  }

  /** Status of any transaction the RPC still retains. */
  async transactionStatus(hash: string): Promise<SubmittedTx> {
    try {
      const got = await this.clients.rpc().getTransaction(hash);
      if (got.status === 'SUCCESS' || got.status === 'FAILED') {
        return { hash, status: got.status, ledger: got.ledger };
      }
      return { hash, status: 'NOT_FOUND' };
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /**
   * Read-only call by raw XDR arguments, for contracts without a WASM spec to
   * build a client from (Stellar Asset Contracts). Simulation only.
   */
  async simulateCall(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<unknown> {
    if (!isContractId(contractId)) throw new ValidationError(`ID de contrato inválido: ${contractId}`);
    const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, '0'), {
      fee: '100',
      networkPassphrase: this.clients.networkPassphrase(),
    })
      .addOperation(Operation.invokeContractFunction({ contract: contractId, function: method, args }))
      .setTimeout(30)
      .build();
    try {
      const sim = await this.clients.rpc().simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
      return sim.result ? scValToNative(sim.result.retval) : undefined;
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /**
   * Identity and `decimals()` of a token contract. A failed read is not
   * cached; the decimals fall back to the SAC's 7 only for the caller that
   * asked, and say so in the logs of whoever handles the error.
   */
  tokenInfo(contractId: string): Promise<TokenInfo> {
    let cached = this.tokenCache.get(contractId);
    if (!cached) {
      cached = (async () => {
        const [decimals, name] = await Promise.all([
          this.simulateCall(contractId, 'decimals'),
          this.simulateCall(contractId, 'name').catch(() => ''),
        ]);
        const label = String(name ?? '');
        const [code, issuer] = label === 'native' ? ['XLM', null] : label.split(':');
        return {
          contractId,
          code: code || 'TOKEN',
          issuer: issuer || null,
          decimals: Number(decimals),
        };
      })();
      this.tokenCache.set(contractId, cached);
      cached.catch(() => this.tokenCache.delete(contractId));
    }
    return cached;
  }

  /** `decimals()` of a token contract, defaulting to the SAC's 7 when it can't be read. */
  async tokenDecimals(contractId: string, onFallback?: (err: unknown) => void): Promise<number> {
    try {
      const { decimals } = await this.tokenInfo(contractId);
      if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) return decimals;
      throw new Error(`decimals() devolvió ${decimals}`);
    } catch (err) {
      onFallback?.(err);
      return SAC_DECIMALS;
    }
  }

  /** Legacy deploy: no constructor (the instance is initialized in a later transaction). */
  async deployFromWasmHash(
    wasmHash: Buffer | string,
    deployer: Keypair,
  ): Promise<{ contractId: string; hash: string | null }> {
    try {
      return await this.deploy(wasmHash, deployer, null);
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /**
   * Deploys and runs `__constructor(args)` in one transaction (SC-06). Other
   * accounts the constructor authenticates sign their auth entries.
   */
  async deployWithConstructor(
    wasmHash: Buffer | string,
    deployer: Keypair,
    args: Record<string, unknown>,
    extraSigners: Keypair[] = [],
  ): Promise<{ contractId: string; hash: string | null }> {
    try {
      return await this.deploy(wasmHash, deployer, args, extraSigners);
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /** Exported function names of an uploaded WASM, read from its contract spec. */
  async wasmFunctions(wasmHash: string): Promise<ReadonlySet<string>> {
    const key = wasmHash.toLowerCase();
    let names = this.specCache.get(key);
    if (!names) {
      names = (async () => {
        const wasm = await this.clients.rpc().getContractWasmByHash(Buffer.from(key, 'hex'));
        return new Set(
          contract.Spec.fromWasm(wasm)
            .funcs()
            .map((f) => String(f.name)),
        );
      })();
      this.specCache.set(key, names);
      names.catch(() => this.specCache.delete(key));
    }
    try {
      return await names;
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  /** Exported function names of a deployed contract's WASM. */
  async contractFunctions(contractId: string): Promise<ReadonlySet<string>> {
    return this.wasmFunctions(await this.wasmHashOf(contractId));
  }

  /**
   * Invokes `method` with `source` as transaction source, letting other
   * accounts authorize calls *below* the root (e.g. a constructor run by the
   * factory: producer and buyer sign it while the admin signs the factory
   * call). Simulates in `record_allow_nonroot` mode, signs each address
   * entry with its keypair, then re-simulates with the signatures in place
   * so resources include their verification.
   */
  async invokeWithCosigners(
    contractId: string,
    method: string,
    args: Record<string, unknown>,
    source: Keypair,
    cosigners: Keypair[] = [],
  ): Promise<InvokeResult> {
    const srv = this.clients.rpc();
    const passphrase = this.clients.networkPassphrase();
    try {
      const client = await this.client(contractId, source);
      const scArgs = client.spec.funcArgsToScVals(method, args);
      const build = async (auth?: xdr.SorobanAuthorizationEntry[]) =>
        new TransactionBuilder(await srv.getAccount(source.publicKey()), {
          fee: SOROBAN_FEE,
          networkPassphrase: passphrase,
        })
          .addOperation(
            Operation.invokeContractFunction({ contract: contractId, function: method, args: scArgs, auth }),
          )
          .setTimeout(SOROBAN_TIMEOUT)
          .build();

      const recorded = await srv.simulateTransaction(await build(), undefined, 'record_allow_nonroot');
      if (!rpc.Api.isSimulationSuccess(recorded)) {
        throw new Error((recorded as { error?: string }).error || 'La simulación falló');
      }
      const validUntil = (await srv.getLatestLedger()).sequence + 100;
      const auth = await Promise.all(
        (recorded.result?.auth ?? []).map(async (entry) => {
          const info = inspectAuthEntry(entry) as { credentialType?: string; address?: string | null };
          // The source account authorizes through the envelope signature; every
          // other credential (`address`, protocol 26's `addressV2`…) names its signer.
          if (info.credentialType === 'sourceAccount' || !info.address) return entry;
          const signer = cosigners.find((kp) => kp.publicKey() === info.address);
          if (!signer) throw new DomainError(`La transacción necesita la firma de ${info.address}`);
          return authorizeEntry(entry, signer, validUntil, passphrase);
        }),
      );

      const prepared = await srv.prepareTransaction(await build(auth));
      prepared.sign(source);
      const sent = await srv.sendTransaction(prepared);
      if (sent.status === 'ERROR') {
        throw new Error(`La red rechazó la transacción: ${JSON.stringify(sent.errorResult)}`);
      }
      const settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
      if (settled.status !== 'SUCCESS') throw new Error(`La transacción terminó en ${settled.status}`);
      const returnValue = (settled as { returnValue?: xdr.ScVal }).returnValue;
      return { hash: sent.hash, result: returnValue ? scValToNative(returnValue) : null };
    } catch (err) {
      throw mapSorobanError(err);
    }
  }

  private async deploy(
    wasmHash: Buffer | string,
    deployer: Keypair,
    args: Record<string, unknown> | null,
    extraSigners: Keypair[] = [],
  ): Promise<{ contractId: string; hash: string | null }> {
    const assembled = await contract.Client.deploy(args, {
      ...this.options(deployer),
      wasmHash,
      format: 'hex',
      address: deployer.publicKey(),
      fee: SOROBAN_FEE,
      timeoutInSeconds: SOROBAN_TIMEOUT,
      restore: true,
    } as Parameters<typeof contract.Client.deploy>[1]);
    for (const signer of extraSigners) {
      if (assembled.needsNonInvokerSigningBy().includes(signer.publicKey())) {
        await assembled.signAuthEntries({
          address: signer.publicKey(),
          signAuthEntry: this.signers(signer).signAuthEntry,
        });
      }
    }
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
