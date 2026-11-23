import type { ChainStockVault } from '@fractachain/shared';
import {
  assetLabel,
  parseChainDate,
  readSource,
  type AssetLabel,
  type ReadSource,
} from '../derivatives/model';

/**
 * A stock vault as the Merval screen shows it — every field read from the
 * contract (`get_metadata`, `get_unclaimed_pool`, `is_mint_paused`,
 * `get_mint_proof`, and for the signed-in wallet `get_balance` +
 * `get_claimable`).
 */
export interface StockVaultView {
  source: ReadSource;
  ticker: string;
  company: string | null;
  isin: string | null;
  custodianCuit: string | null;
  sharesCustodied: number | null;
  tokensMinted: number | null;
  /** Shares in custody per token minted, in percent; null when nothing is minted. */
  backingPct: number | null;
  lastAudit: Date | null;
  /** null when the vault predates `get_unclaimed_pool` (the API then doesn't list it in `reads`). */
  unclaimedPool: number | null;
  mintPaused: boolean;
  /** Latest `get_mint_proof`: mint number, recipient, amount and the custody slip hash. */
  lastProof: { seq: number | null; to: string | null; amount: number | null; hash: string | null } | null;
  asset: AssetLabel;
  holder: { address: string; balance: number; claimable: number } | null;
}

/** Reads `snake_case` or `camelCase`, whichever the payload carries. */
function field(record: Record<string, unknown> | null | undefined, ...names: string[]): unknown {
  if (!record) return undefined;
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
}

const maybeNum = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const maybeText = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export function backingPct(shares: number | null, tokens: number | null): number | null {
  if (shares === null || tokens === null || tokens <= 0) return null;
  return Math.round((shares / tokens) * 1000) / 10;
}

export function stockVaultView(v: ChainStockVault): StockVaultView {
  const m = (v.metadata ?? {}) as Record<string, unknown>;
  const source = readSource(v);
  const poolRead = source.reads.length === 0 || source.reads.includes('get_unclaimed_pool');
  const shares = maybeNum(field(m, 'total_shares_custodied', 'totalSharesCustodied'));
  const tokens = maybeNum(field(m, 'total_tokens_minted', 'totalTokensMinted'));
  const proof = v.lastProof;
  return {
    source,
    ticker: maybeText(field(m, 'ticker', 'symbol')) ?? '—',
    company: maybeText(field(m, 'company_name', 'companyName')),
    isin: maybeText(field(m, 'isin')),
    custodianCuit: maybeText(field(m, 'custodian_cuit', 'custodianCuit')),
    sharesCustodied: shares,
    tokensMinted: tokens,
    backingPct: backingPct(shares, tokens),
    lastAudit: parseChainDate(field(m, 'last_audit_timestamp', 'lastAuditTimestamp', 'lastAudit')),
    unclaimedPool: poolRead ? (maybeNum(v.unclaimedPool) ?? 0) : null,
    mintPaused: Boolean(v.mintPaused),
    lastProof: proof
      ? {
          seq: maybeNum(proof.seq),
          to: maybeText(proof.to),
          amount: maybeNum(proof.amount),
          hash: maybeText(proof.cvDepositHash),
        }
      : null,
    asset: assetLabel(v.paymentToken),
    holder: v.holder
      ? {
          address: v.holder.address,
          balance: maybeNum(v.holder.balance) ?? 0,
          claimable: maybeNum(v.holder.claimable) ?? 0,
        }
      : null,
  };
}
