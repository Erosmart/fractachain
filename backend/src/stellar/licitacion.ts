import { Keypair } from '@stellar/stellar-sdk';
import { custodialSigningKey, getAccount } from '../auth/accounts';
import { isStellarPublicKey, loadNativeXlm } from '../auth/stellar_testnet';
import { Listing } from '../admin/listings';
import { licitacionAdminKeypair } from './keys';
import {
  AnyClient,
  contractClient,
  fromStroops,
  invoke,
  isLiveContractId,
  read,
  submitSignedSorobanXdr,
  toStroops,
  unsignedInvocationXdr,
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

/** The wallet a self-custody investor signs with, or why they cannot yet. */
function selfCustodyWallet(accountId: string): string {
  const account = getAccount(accountId);
  if (!account) throw new Error('Inversor no encontrado');
  if (!account.publicKey) throw new Error('Conectá tu wallet Freighter antes de operar');
  if (account.custodyMode === 'CUSTODIAL') {
    throw new Error('Esta cuenta es custodial: el backend firma por vos, no hace falta Freighter');
  }
  return account.publicKey;
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

/**
 * Points the contract's `Fiduciary` at the company wallet of the dossier.
 *
 * The instance is deployed before the dossier exists, so it starts paying the
 * platform deployer. The contract only accepts the change while nothing has
 * been raised, which is also the only window where it is fair to move it.
 */
export async function syncFiduciaryOnChain(listing: Listing): Promise<{
  hash: string | null;
  fiduciary: string;
} | null> {
  if (!isLiveContractId(listing.licitacionContract)) return null;
  const wallet = listing.dossier.proceedsWallet?.trim().toUpperCase();
  if (!isStellarPublicKey(wallet)) return null;

  const { client, admin } = await adminClient(listing);
  const [current, raised] = await Promise.all([
    read<string>(client, 'get_fiduciary').catch(() => null),
    read<bigint>(client, 'get_total_raised').catch(() => 0n),
  ]);
  if (current && String(current) === wallet) return { hash: null, fiduciary: wallet };
  if (fromStroops(raised) > 0) {
    throw new Error(
      `La licitación ya recibió aportes: el contrato paga a ${current} y no se puede repuntar a ${wallet}`,
    );
  }

  const { hash } = await invoke(client, 'set_fiduciary', {
    admin: admin.publicKey(),
    fiduciary: wallet,
  });
  return { hash, fiduciary: wallet };
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
    throw new Error('Wallet propia: firmá el aporte con Freighter desde la ficha de la licitación');
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

  const [raisedStroops, rwa] = await Promise.all([
    read<bigint>(client, 'get_total_raised'),
    read<bigint>(client, 'get_rwa_balance', { user: buyer.publicKey() }),
  ]);
  return {
    hash,
    raised: fromStroops(raisedStroops),
    tokens: Number(rwa),
    licitacion: listing.licitacionContract,
  };
}

/**
 * Self-custody counterpart of `contributeOnChain`.
 *
 * Returns the simulated invocation so Freighter can sign it; the platform
 * still runs the admin-only `verify_investor` first, because the contract
 * rejects a contribution from a wallet it has no KYC record for.
 */
export async function prepareContributeXdr(
  listing: Listing,
  accountId: string,
  amount: number,
): Promise<{ xdr: string; publicKey: string; verifyHash: string | null }> {
  const wallet = selfCustodyWallet(accountId);
  const xlm = await loadNativeXlm(wallet);
  if (xlm < amount + 2) {
    throw new Error(
      `Tu wallet tiene ${xlm.toFixed(2)} XLM y el aporte es ${amount}. Cargá XLM de testnet con Friendbot.`,
    );
  }
  const verifyHash = await verifyInvestorOnChain(listing, wallet);
  const xdr = await unsignedInvocationXdr(licitacionId(listing), wallet, 'contribute', {
    buyer: wallet,
    payment_amount: toStroops(amount),
  });
  return { xdr, publicKey: wallet, verifyHash };
}

/** Relays the signed contribution and reads back what the contract recorded. */
export async function submitContributeXdr(
  listing: Listing,
  accountId: string,
  signedXdr: string,
): Promise<{ hash: string; raised: number; tokens: number; licitacion: string }> {
  const wallet = selfCustodyWallet(accountId);
  const hash = await submitSignedSorobanXdr(signedXdr);
  const client = await contractClient(licitacionId(listing));
  const [raisedStroops, rwa] = await Promise.all([
    read<bigint>(client, 'get_total_raised'),
    read<bigint>(client, 'get_rwa_balance', { user: wallet }),
  ]);
  return {
    hash,
    raised: fromStroops(raisedStroops),
    tokens: Number(rwa),
    licitacion: listing.licitacionContract,
  };
}

export async function prepareRefundXdr(
  listing: Listing,
  accountId: string,
): Promise<{ xdr: string; publicKey: string }> {
  const wallet = selfCustodyWallet(accountId);
  const xdr = await unsignedInvocationXdr(licitacionId(listing), wallet, 'refund', {
    contributor: wallet,
  });
  return { xdr, publicKey: wallet };
}

export async function submitRefundXdr(
  listing: Listing,
  accountId: string,
  signedXdr: string,
): Promise<{ hash: string; refunded: number; rwa: number }> {
  const wallet = selfCustodyWallet(accountId);
  const client = await contractClient(licitacionId(listing));
  const [before, price] = await Promise.all([
    read<bigint>(client, 'get_rwa_balance', { user: wallet }).catch(() => 0n),
    read<bigint>(client, 'get_price_per_unit').catch(() => 0n),
  ]);
  const hash = await submitSignedSorobanXdr(signedXdr);
  const after = await read<bigint>(client, 'get_rwa_balance', { user: wallet }).catch(() => 0n);
  const units = Number(before);
  return {
    hash,
    refunded: price && units > 0 ? fromStroops(BigInt(units) * BigInt(price)) : 0,
    rwa: Number(after),
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
    throw new Error('Wallet propia: firmá el refund con Freighter desde la ficha de la licitación');
  }
  const contributor = Keypair.fromSecret(custodialSigningKey(accountId));
  const client = await contractClient(licitacionId(listing), contributor);
  const [before, price] = await Promise.all([
    read<bigint>(client, 'get_rwa_balance', { user: contributor.publicKey() }).catch(() => 0n),
    read<bigint>(client, 'get_price_per_unit').catch(() => 0n),
  ]);
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
  /** XLM actually sitting in the wallet the contract pays. */
  fiduciaryXlm?: number | null;
  /** The dossier wallet differs from the address `finalize()` pays. */
  fiduciaryMismatch?: boolean;
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
    const snapshot = snapshotFromReads(listing, reads);
    const wallet = listing.dossier.proceedsWallet?.trim().toUpperCase();
    snapshot.fiduciaryXlm = reads.fiduciary ? await loadNativeXlm(reads.fiduciary) : null;
    snapshot.fiduciaryMismatch = Boolean(
      reads.fiduciary && isStellarPublicKey(wallet) && reads.fiduciary !== wallet,
    );
    return snapshot;
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
