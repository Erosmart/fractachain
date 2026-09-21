import { Keypair } from '@stellar/stellar-sdk';
import { custodialSigningKey, getAccount } from '../auth/accounts';
import { loadNativeXlm } from '../auth/stellar_testnet';
import { Listing } from '../admin/listings';
import { licitacionAdminKeypair } from './keys';
import {
  AnyClient,
  contractClient,
  fromStroops,
  invoke,
  isLiveContractId,
  read,
  toStroops,
} from './soroban';
import {
  canFinalizeFromSnapshot,
  expectedCloseStatus,
  licitacionStateName,
  listingDeadlineMs,
  parseLicitacionState,
} from './licitacion_state';
import { explorerTx } from './onchain';

const ARGENTINA = 32;
const INVESTOR_NATIONAL = 0;
const YEAR_SECS = 365 * 24 * 3600;

function licitacionId(listing: Listing): string {
  if (!isLiveContractId(listing.licitacionContract)) {
    throw new Error('Esta licitación no tiene un contrato Soroban real');
  }
  return listing.licitacionContract;
}

async function adminClient(listing: Listing): Promise<{ client: AnyClient; admin: Keypair }> {
  const admin = await licitacionAdminKeypair();
  return { client: await contractClient(licitacionId(listing), admin), admin };
}

export async function isInvestorVerified(listing: Listing, investor: string): Promise<boolean> {
  const client = await contractClient(licitacionId(listing));
  return Boolean(await read<boolean>(client, 'is_verified', { investor }));
}

export async function verifyInvestorOnChain(listing: Listing, investor: string): Promise<string | null> {
  if (!isLiveContractId(listing.licitacionContract) || !investor) return null;
  if (await isInvestorVerified(listing, investor)) return null;
  const { client, admin } = await adminClient(listing);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + YEAR_SECS);
  const { hash } = await invoke(client, 'verify_investor', {
    admin: admin.publicKey(),
    investor,
    country_code: ARGENTINA,
    investor_type: INVESTOR_NATIONAL,
    expiry,
  });
  return hash;
}

export async function contributeOnChain(
  listing: Listing,
  accountId: string,
  amount: number,
): Promise<{
  hash: string;
  raised: number;
  tokens: number;
  licitacion: string;
}> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Inversor no encontrado');
  if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) {
    throw new Error(
      'El aporte on-chain de esta demo se firma con custodia de la plataforma. Las wallets propias (Freighter) vienen después del 27/09.',
    );
  }
  const buyer = Keypair.fromSecret(custodialSigningKey(accountId));
  const xlm = await loadNativeXlm(buyer.publicKey());
  if (xlm < amount + 2) {
    throw new Error(
      `La wallet tiene ${xlm.toFixed(2)} XLM y el aporte es ${amount}. Friendbot o recargá XLM de testnet.`,
    );
  }

  await verifyInvestorOnChain(listing, buyer.publicKey());

  const stroops = toStroops(amount);
  const client = await contractClient(licitacionId(listing), buyer);
  const { hash } = await invoke(client, 'contribute', {
    buyer: buyer.publicKey(),
    payment_amount: stroops,
  });
  if (!hash) throw new Error('El aporte se envió pero no volvió hash de transacción');

  const raisedStroops = await read<bigint>(client, 'get_total_raised');
  const rwa = await read<bigint>(client, 'get_rwa_balance', { user: buyer.publicKey() });
  return {
    hash,
    raised: fromStroops(raisedStroops),
    tokens: Number(rwa),
    licitacion: listing.licitacionContract,
  };
}

export async function finalizeOnChain(listing: Listing): Promise<{
  hash: string | null;
  state: number;
  raised: number;
  proceedsWithdrawn: boolean;
  fiduciary: string | null;
}> {
  const { client } = await adminClient(listing);
  const { hash } = await invoke(client, 'finalize');
  const snap = await readLicitacion(listing);
  return {
    hash,
    state: snap.state,
    raised: snap.raised,
    proceedsWithdrawn: snap.proceedsWithdrawn,
    fiduciary: snap.fiduciary,
  };
}

export async function refundOnChain(
  listing: Listing,
  accountId: string,
): Promise<{
  hash: string | null;
  refunded: number;
  rwa: number;
}> {
  const account = getAccount(accountId);
  if (!account) throw new Error('Inversor no encontrado');
  if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) {
    throw new Error(
      'El reembolso on-chain de esta demo se firma con custodia de la plataforma. Freighter no está en el happy path.',
    );
  }
  const contributor = Keypair.fromSecret(custodialSigningKey(accountId));
  const client = await contractClient(licitacionId(listing), contributor);
  const before = await read<bigint>(client, 'get_rwa_balance', { user: contributor.publicKey() }).catch(() => 0n);
  const price = await read<bigint>(client, 'get_price_per_unit').catch(() => 0n);
  const { hash } = await invoke(client, 'refund', {
    contributor: contributor.publicKey(),
  });
  const after = await read<bigint>(client, 'get_rwa_balance', { user: contributor.publicKey() }).catch(() => 0n);
  const units = Number(before);
  const refunded = price && units > 0 ? fromStroops(BigInt(units) * BigInt(price)) : 0;
  return { hash, refunded, rwa: Number(after) };
}

export async function withdrawProceedsOnChain(listing: Listing): Promise<{
  hash: string | null;
  amount: number;
}> {
  const { client, admin } = await adminClient(listing);
  const { hash, result } = await invoke(client, 'withdraw_proceeds', {
    admin: admin.publicKey(),
  });
  const amount = typeof result === 'bigint' || typeof result === 'number' || typeof result === 'string'
    ? fromStroops(result as bigint | number | string)
    : 0;
  return { hash, amount };
}

export type LicitacionSnapshot = {
  live: boolean;
  state: number;
  stateName: string;
  raised: number;
  price: number;
  proceedsWithdrawn: boolean;
  fiduciary: string | null;
  investorRwa: number | null;
  canFinalize: boolean;
  finalizeReason: string;
  deadline: string | null;
  error?: string;
};

export async function readLicitacion(listing: Listing, investor?: string): Promise<{
  state: number;
  raised: number;
  price: number;
  proceedsWithdrawn: boolean;
  fiduciary: string | null;
  investorRwa: number | null;
}> {
  const client = await contractClient(licitacionId(listing));
  const [stateRaw, raised, price, withdrawn, fiduciary] = await Promise.all([
    read<unknown>(client, 'get_state'),
    read<bigint>(client, 'get_total_raised'),
    read<bigint>(client, 'get_price_per_unit'),
    read<boolean>(client, 'proceeds_withdrawn').catch(() => false),
    read<string>(client, 'get_fiduciary').catch(() => null),
  ]);
  let investorRwa: number | null = null;
  if (investor) {
    try {
      const rwa = await read<bigint>(client, 'get_rwa_balance', { user: investor });
      investorRwa = Number(rwa);
    } catch {
      investorRwa = null;
    }
  }
  return {
    state: parseLicitacionState(stateRaw),
    raised: fromStroops(raised),
    price: fromStroops(price),
    proceedsWithdrawn: Boolean(withdrawn),
    fiduciary: fiduciary ? String(fiduciary) : null,
    investorRwa,
  };
}

export function snapshotFromReads(
  listing: Listing,
  reads: Awaited<ReturnType<typeof readLicitacion>>,
): LicitacionSnapshot {
  const deadlineMs = listingDeadlineMs({
    settleAt: listing.settleAt,
    listedAt: listing.listedAt,
    offeringDays: listing.dossier.offeringDays,
  });
  const gate = canFinalizeFromSnapshot({
    state: reads.state,
    raised: reads.raised,
    hardCap: listing.dossier.offeringHardCapUsdc,
    deadlineMs,
  });
  return {
    live: true,
    state: reads.state,
    stateName: licitacionStateName(reads.state),
    raised: reads.raised,
    price: reads.price,
    proceedsWithdrawn: reads.proceedsWithdrawn,
    fiduciary: reads.fiduciary,
    investorRwa: reads.investorRwa,
    canFinalize: gate.canFinalize,
    finalizeReason: gate.reason,
    deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
  };
}

export async function snapshotLicitacion(
  listing: Listing,
  investor?: string,
): Promise<LicitacionSnapshot> {
  if (!isLiveContractId(listing.licitacionContract) || listing.dossier.paymentKind !== 'XLM') {
    const deadlineMs = listingDeadlineMs({
      settleAt: listing.settleAt,
      listedAt: listing.listedAt,
      offeringDays: listing.dossier.offeringDays,
    });
    return {
      live: false,
      state: -1,
      stateName: 'Unknown',
      raised: listing.raisedUsdc,
      price: listing.dossier.pricePerShareUsdc,
      proceedsWithdrawn: Boolean(listing.proceedsPaidAt),
      fiduciary: listing.dossier.proceedsWallet || null,
      investorRwa: null,
      canFinalize: false,
      finalizeReason: listing.status === 'LISTED' ? 'waiting' : 'already_closed',
      deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
    };
  }
  try {
    const reads = await readLicitacion(listing, investor);
    return snapshotFromReads(listing, reads);
  } catch (err: any) {
    const deadlineMs = listingDeadlineMs({
      settleAt: listing.settleAt,
      listedAt: listing.listedAt,
      offeringDays: listing.dossier.offeringDays,
    });
    return {
      live: false,
      state: -1,
      stateName: 'Unknown',
      raised: listing.raisedUsdc,
      price: listing.dossier.pricePerShareUsdc,
      proceedsWithdrawn: Boolean(listing.proceedsPaidAt),
      fiduciary: listing.dossier.proceedsWallet || null,
      investorRwa: null,
      canFinalize: false,
      finalizeReason: 'waiting',
      deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
      error: err?.message || String(err),
    };
  }
}

export function closeStatusFromChain(snapshot: LicitacionSnapshot, listing: Listing) {
  return expectedCloseStatus({
    state: snapshot.state,
    raised: snapshot.raised,
    softCap: listing.dossier.offeringSoftCapUsdc,
  });
}

export function finalizeReceipt(hash?: string | null) {
  return {
    hash: hash || null,
    explorer: explorerTx(hash),
  };
}

export function alreadyClosedOnChain(snapshot: LicitacionSnapshot): boolean {
  return snapshot.state === 1 || snapshot.state === 2 || snapshot.state === 3;
}
