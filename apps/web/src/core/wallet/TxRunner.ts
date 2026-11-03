import type { TxBuildRequest, TxBuildResult, TxStatusResult, TxSubmitResult } from '@fractachain/shared';
import { ApiError } from '../http/HttpClient';
import { WalletError, type IWalletSigner } from './WalletSigner';

/**
 * Where an on-chain action stands. Self-custody goes through every step;
 * the custodial fallback skips `review` and `signing` (the platform signs).
 */
export type TxPhase =
  'idle' | 'preparing' | 'review' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error';

export type TxErrorCode =
  | 'WALLET_NOT_INSTALLED'
  | 'WALLET_DENIED'
  | 'WRONG_NETWORK'
  | 'ACCOUNT_MISMATCH'
  | 'USER_REJECTED'
  | 'NO_SIGNED_TX'
  | 'TX_EXPIRED'
  | 'TX_MISMATCH'
  | 'TX_ALREADY_SUBMITTED'
  | 'TX_BAD_SIGNATURE'
  | 'TX_FAILED'
  | 'RPC_DOWN'
  | 'API_DOWN'
  | 'NOT_ALLOWED'
  /** The server lacks the configuration for this action (e.g. no demo USDC pool). */
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export interface TxError {
  code: TxErrorCode;
  /** Server or wallet message, shown when there is no better copy. */
  message: string;
  /** Raw technical text (contract trap, RPC dump), kept behind a disclosure. */
  detail?: string;
  /** Facts for the copy: the wallet's network, the expected account… */
  facts?: Record<string, string>;
  /** Building again fixes it (expired build, sequence moved on). */
  retryable: boolean;
}

/** Outcome shown on screen: the hash and its explorer link when there is one. */
export interface TxOutcome {
  hash: string | null;
  explorer: string | null;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'DONE';
  ledger?: number;
}

export interface TxSnapshot {
  phase: TxPhase;
  /** What is being done (`contribute`, `refund`, …): picks the copy. */
  action: string | null;
  /** Self-custody: the prepared transaction, shown before signing. */
  build: TxBuildResult | null;
  outcome: TxOutcome | null;
  error: TxError | null;
  /** The platform signs (custodial fallback). */
  custodial: boolean;
}

export interface TxApiLike {
  build(request: TxBuildRequest): Promise<TxBuildResult>;
  submit(buildId: string, signedXdr: string): Promise<TxSubmitResult>;
  status(hash: string): Promise<TxStatusResult>;
}

export const IDLE: TxSnapshot = {
  phase: 'idle',
  action: null,
  build: null,
  outcome: null,
  error: null,
  custodial: false,
};

const SERVER_CODES: ReadonlySet<string> = new Set([
  'TX_EXPIRED',
  'TX_MISMATCH',
  'TX_ALREADY_SUBMITTED',
  'TX_BAD_SIGNATURE',
  'TX_FAILED',
]);
/** The wallet refused or could not sign: nothing reached the network. */
export const WALLET_CODES: ReadonlySet<TxErrorCode> = new Set([
  'WALLET_NOT_INSTALLED',
  'WALLET_DENIED',
  'WRONG_NETWORK',
  'ACCOUNT_MISMATCH',
  'USER_REJECTED',
  'NO_SIGNED_TX',
]);
const RETRYABLE: ReadonlySet<TxErrorCode> = new Set(['TX_EXPIRED', 'TX_MISMATCH', 'RPC_DOWN', 'API_DOWN']);
const TECHNICAL = /HostError|simulation|Error\(|Diagnostic|tx_[a-z_]+|op_[a-z_]+|invokeHostFunction/i;

/** Maps anything a step can throw to one code the UI explains. */
export function classifyTxError(err: unknown): TxError {
  const message = err instanceof Error ? err.message : String(err ?? '');
  let code: TxErrorCode = 'UNKNOWN';
  let facts: Record<string, string> | undefined;
  if (err instanceof WalletError) {
    code = err.code;
    facts = err.facts;
  } else if (err instanceof ApiError) {
    if (err.isNetwork) code = 'API_DOWN';
    else if (err.code && SERVER_CODES.has(err.code)) code = err.code as TxErrorCode;
    else if (err.code === 'NOT_CONFIGURED') code = 'NOT_CONFIGURED';
    // The build is gone (server restart, already consumed): prepare a new one.
    else if (err.status === 404 || err.status === 410) code = 'TX_EXPIRED';
    else if (err.code === 'UPSTREAM_FAILED' || err.status === 502 || err.status === 503) code = 'RPC_DOWN';
    else if (err.status === 401 || err.status === 403 || err.status === 409) code = 'NOT_ALLOWED';
  } else if (err instanceof TypeError && /fetch|network/i.test(message)) {
    code = 'API_DOWN';
  }
  const technical = TECHNICAL.test(message) || message.length > 180;
  return {
    code,
    message: technical ? '' : message,
    detail: technical ? message : undefined,
    facts,
    retryable: RETRYABLE.has(code),
  };
}

export interface TxRunnerOptions {
  /** How many times to ask for the status of a PENDING transaction. */
  pollAttempts?: number;
  pollDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The single flow every on-chain action runs through (Instaward 1,
 * Deliverable 2): build → review → sign in the investor's wallet → submit →
 * confirm. State changes are pushed to `onChange`; the runner never throws.
 */
export class TxRunner {
  private snap: TxSnapshot = IDLE;
  private request: TxBuildRequest | null = null;
  private expectedSigner: string | null = null;
  private readonly pollAttempts: number;
  private readonly pollDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly api: TxApiLike,
    private readonly signer: IWalletSigner,
    private readonly onChange: (snap: TxSnapshot) => void,
    options: TxRunnerOptions = {},
  ) {
    this.pollAttempts = options.pollAttempts ?? 20;
    this.pollDelayMs = options.pollDelayMs ?? 1500;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get snapshot(): TxSnapshot {
    return this.snap;
  }

  /** Step 1 (self-custody): the API builds and prepares; the result is shown for review. */
  async prepare(request: TxBuildRequest, expectedSigner?: string | null): Promise<TxSnapshot> {
    this.request = request;
    this.expectedSigner = expectedSigner ?? null;
    this.set({ ...IDLE, phase: 'preparing', action: request.action });
    try {
      const build = await this.api.build(request);
      if (this.expectedSigner && build.source !== this.expectedSigner) {
        // The API built for another account than the one this session linked.
        return this.fail({
          code: 'ACCOUNT_MISMATCH',
          message: '',
          facts: { expected: this.expectedSigner, actual: build.source },
          retryable: false,
        });
      }
      return this.set({ ...this.snap, phase: 'review', build });
    } catch (err) {
      return this.fail(classifyTxError(err));
    }
  }

  /** Step 2: the investor signs in the wallet; the API validates, submits and confirms. */
  async sign(): Promise<TxSnapshot> {
    const build = this.snap.build;
    if (!build || this.snap.phase !== 'review') return this.snap;
    if (Date.parse(build.expiresAt) <= this.now()) {
      return this.fail({ code: 'TX_EXPIRED', message: '', retryable: true });
    }
    this.set({ ...this.snap, phase: 'signing' });
    let signed: string;
    try {
      signed = await this.signer.signTransaction(build.xdr, {
        address: build.source,
        networkPassphrase: build.networkPassphrase,
      });
    } catch (err) {
      return this.fail(classifyTxError(err));
    }
    this.set({ ...this.snap, phase: 'submitting' });
    try {
      const result = await this.api.submit(build.buildId, signed);
      return await this.settle(result.hash, result.status, result.explorer, result.ledger);
    } catch (err) {
      // A transaction that reached the ledger and failed still has a hash worth showing.
      const details = err instanceof ApiError ? err.details : undefined;
      if (details && typeof details.hash === 'string') {
        const explorer = typeof details.explorer === 'string' ? details.explorer : null;
        this.set({ ...this.snap, outcome: { hash: details.hash, explorer, status: 'FAILED' } });
      }
      return this.fail(classifyTxError(err));
    }
  }

  /**
   * Back to the review after a wallet problem (wrong network, rejected, locked):
   * nothing was submitted, so the same build can be signed while it is valid.
   */
  backToReview(): TxSnapshot {
    const { build, error } = this.snap;
    if (!build || !error || !WALLET_CODES.has(error.code) || Date.parse(build.expiresAt) <= this.now()) {
      return this.snap;
    }
    return this.set({ ...this.snap, phase: 'review', error: null });
  }

  /** Builds the same request again (after an expired or stale build). */
  retry(): Promise<TxSnapshot> {
    if (!this.request) return Promise.resolve(this.snap);
    return this.prepare(this.request, this.expectedSigner);
  }

  /**
   * Custodial fallback: the platform signs server-side; the screen shows the
   * same steps minus the wallet ones.
   */
  async runCustodial(
    action: string,
    perform: () => Promise<{ hash?: string | null; explorer?: string | null } | void>,
  ): Promise<TxSnapshot> {
    this.request = null;
    this.set({ ...IDLE, phase: 'submitting', action, custodial: true });
    try {
      const res = (await perform()) || {};
      const hash = res.hash ?? null;
      return this.set({
        ...this.snap,
        phase: 'done',
        outcome: { hash, explorer: res.explorer ?? null, status: hash ? 'SUCCESS' : 'DONE' },
      });
    } catch (err) {
      return this.fail(classifyTxError(err));
    }
  }

  reset(): TxSnapshot {
    this.request = null;
    return this.set(IDLE);
  }

  private async settle(
    hash: string,
    status: TxSubmitResult['status'],
    explorer: string,
    ledger?: number,
  ): Promise<TxSnapshot> {
    let current = { status, explorer, ledger };
    if (status === 'PENDING' || status === 'NOT_FOUND') {
      this.set({ ...this.snap, phase: 'confirming', outcome: { hash, explorer, status: 'PENDING' } });
      for (let i = 0; i < this.pollAttempts; i++) {
        await this.sleep(this.pollDelayMs);
        try {
          const polled = await this.api.status(hash);
          current = { status: polled.status, explorer: polled.explorer || explorer, ledger: polled.ledger };
          if (polled.status === 'SUCCESS' || polled.status === 'FAILED') break;
        } catch {
          // Keep polling: a flaky status read says nothing about the transaction.
        }
      }
    }
    if (current.status === 'SUCCESS') {
      return this.set({
        ...this.snap,
        phase: 'done',
        outcome: { hash, explorer: current.explorer, status: 'SUCCESS', ledger: current.ledger },
      });
    }
    const outcome: TxOutcome = {
      hash,
      explorer: current.explorer,
      status: current.status === 'FAILED' ? 'FAILED' : 'PENDING',
    };
    this.set({ ...this.snap, outcome });
    return this.fail({
      code: current.status === 'FAILED' ? 'TX_FAILED' : 'RPC_DOWN',
      message: '',
      retryable: current.status !== 'FAILED',
    });
  }

  private fail(error: TxError): TxSnapshot {
    return this.set({ ...this.snap, phase: 'error', error });
  }

  private set(next: TxSnapshot): TxSnapshot {
    this.snap = next;
    this.onChange(next);
    return next;
  }
}
