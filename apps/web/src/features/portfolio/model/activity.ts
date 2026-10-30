/**
 * Wallet activity read from Horizon (public ledger data): one record per
 * operation, newest first. Only the fields the UI reads are typed.
 */
export interface HorizonOperation {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  source_account?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  funder?: string;
  account?: string;
  starting_balance?: string;
  limit?: string;
  selling_asset_type?: string;
  selling_asset_code?: string;
  buying_asset_type?: string;
  buying_asset_code?: string;
}

export type OpKey =
  'received' | 'sent' | 'created' | 'funded' | 'trustOn' | 'trustOff' | 'contract' | 'offer' | 'other';

export interface ActivityItem {
  id: string;
  at: Date;
  hash: string;
  /** Key under `dashboard.activity.ops`. */
  key: OpKey;
  vars: Record<string, string>;
  direction: 'in' | 'out' | null;
}

const assetLabel = (type?: string, code?: string) => (type === 'native' ? 'XLM' : code || '—');

/** Turns a Horizon operation into a sentence key + variables, from the wallet's point of view. */
export function describeOperation(
  op: HorizonOperation,
  me: string,
  fmt: (raw: string) => string,
): ActivityItem {
  const base = { id: op.id, at: new Date(op.created_at), hash: op.transaction_hash };
  switch (op.type) {
    case 'payment':
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send': {
      const vars = { amount: fmt(op.amount ?? '0'), asset: assetLabel(op.asset_type, op.asset_code) };
      if (op.to === me) return { ...base, key: 'received', vars, direction: 'in' };
      if (op.from === me) return { ...base, key: 'sent', vars, direction: 'out' };
      break;
    }
    case 'create_account': {
      const vars = { amount: fmt(op.starting_balance ?? '0') };
      if (op.account === me) return { ...base, key: 'created', vars, direction: 'in' };
      return { ...base, key: 'funded', vars, direction: 'out' };
    }
    case 'change_trust': {
      const removed = Number(op.limit) === 0;
      return {
        ...base,
        key: removed ? 'trustOff' : 'trustOn',
        vars: { asset: assetLabel(op.asset_type, op.asset_code) },
        direction: null,
      };
    }
    case 'invoke_host_function':
      return { ...base, key: 'contract', vars: {}, direction: null };
    case 'manage_sell_offer':
    case 'manage_buy_offer':
    case 'create_passive_sell_offer':
      return {
        ...base,
        key: 'offer',
        vars: {
          selling: assetLabel(op.selling_asset_type, op.selling_asset_code),
          buying: assetLabel(op.buying_asset_type, op.buying_asset_code),
        },
        direction: null,
      };
  }
  return { ...base, key: 'other', vars: { type: op.type.replace(/_/g, ' ') }, direction: null };
}

/** Local calendar day key ("2026-10-29"). */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DayCount {
  key: string;
  date: Date;
  count: number;
}

/** Operations per local day for the `days` days ending today (oldest first). */
export function dailyCounts(
  ops: Pick<HorizonOperation, 'created_at'>[],
  now: Date,
  days: number,
): DayCount[] {
  const buckets: DayCount[] = [];
  const index = new Map<string, DayCount>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const row = { key: dayKey(date), date, count: 0 };
    buckets.push(row);
    index.set(row.key, row);
  }
  for (const op of ops) {
    const at = new Date(op.created_at);
    if (Number.isNaN(at.getTime())) continue;
    const row = index.get(dayKey(at));
    if (row) row.count += 1;
  }
  return buckets;
}
