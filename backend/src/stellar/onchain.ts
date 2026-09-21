/**
 * Live testnet receipts for the Genesis demo.
 *
 * When the listing points at a real Soroban licitacion, contribute() of the
 * contract is the primary. The classic LILAS trustline is still opened for
 * the SDEX rail, but it is not the subscription.
 */
import { getListing, isOnChainListing, Listing } from '../admin/listings';
import { addTrustline, getAccount } from '../auth/accounts';
import { openCustodialTrustline, sdexAvailable } from '../market/sdex_book';
import { loadTestnetDeployment } from './deployment';
import { isLiveContractId, rpcServer } from './soroban';

const EXPERT = 'https://stellar.expert/explorer/testnet';

export function explorerContract(id?: string | null) {
  return isLiveContractId(id) ? `${EXPERT}/contract/${id}` : null;
}

export function explorerTx(hash?: string | null) {
  return hash ? `${EXPERT}/tx/${hash}` : null;
}

export function listingChainMeta(listing?: Listing | null) {
  const deployment = loadTestnetDeployment();
  const licitacion = listing?.licitacionContract || deployment?.licitacion || null;
  const live = listing ? isOnChainListing(listing) : isLiveContractId(licitacion);
  return {
    sandboxPrimary: !live,
    network: 'testnet',
    licitacion,
    explorer: explorerContract(licitacion),
    paymentKind: listing?.dossier.paymentKind || null,
  };
}

export async function getOnChainStatus() {
  const deployment = loadTestnetDeployment();
  let ledger: number | null = null;
  let rpcOk = false;
  let error: string | undefined;
  try {
    const latest = await rpcServer().getLatestLedger();
    ledger = latest.sequence;
    rpcOk = true;
  } catch (err: any) {
    error = err?.message || String(err);
  }
  return {
    network: deployment?.network || 'testnet',
    onChain: Boolean(isLiveContractId(deployment?.licitacion)),
    rpcOk,
    ledger,
    error,
    factory: deployment?.factory || null,
    licitacion: deployment?.licitacion || null,
    licitacionLegacy: deployment?.licitacionLegacy || null,
    stockVault: deployment?.stockVault || null,
    forward: deployment?.forward || null,
    warrant: deployment?.warrant || null,
    warrantFactory: deployment?.warrantFactory || null,
    issuer: deployment?.issuer || null,
    explorer: {
      factory: explorerContract(deployment?.factory),
      licitacion: explorerContract(deployment?.licitacion),
      stockVault: explorerContract(deployment?.stockVault),
      forward: explorerContract(deployment?.forward),
      warrant: explorerContract(deployment?.warrant),
      warrantFactory: explorerContract(deployment?.warrantFactory),
    },
  };
}

export async function receiptAfterContribute(
  listingId: string,
  accountId: string,
  extra?: { contributeHash?: string | null },
) {
  const listing = getListing(listingId);
  const account = getAccount(accountId);
  const meta = listingChainMeta(listing);
  const receipt: {
    sandboxPrimary: boolean;
    network: string;
    licitacion: string | null;
    explorer: string | null;
    paymentKind: string | null;
    contributeHash: string | null;
    contributeExplorer: string | null;
    trustlineHash: string | null;
    trustlineExplorer: string | null;
    note: string;
    trustlineError?: string;
  } = {
    ...meta,
    contributeHash: extra?.contributeHash || null,
    contributeExplorer: explorerTx(extra?.contributeHash),
    trustlineHash: null,
    trustlineExplorer: null,
    note: extra?.contributeHash
      ? 'Aporte on-chain a la licitación. El hash es contribute() en testnet.'
      : 'El aporte primario queda en el backend. Si hay wallet custodial y emisor Stellar, la trustline sí se manda a testnet.',
  };

  if (!listing || !account) return receipt;

  try {
    addTrustline(accountId, listingId);
  } catch {
    // already recorded or KYC/wallet missing — contribute already gated that
  }

  if (!(sdexAvailable(listing) && account.custodyMode === 'CUSTODIAL' && account.publicKey)) {
    return receipt;
  }

  try {
    const result = await openCustodialTrustline({ listingId, accountId });
    receipt.trustlineHash = result.hash || null;
    receipt.trustlineExplorer = explorerTx(result.hash);
    if (result.hash && !extra?.contributeHash) {
      receipt.note =
        'Aporte sandbox + trustline en Stellar testnet. Abrí el hash en Stellar Expert.';
    }
  } catch (err: any) {
    receipt.trustlineError = err?.message || String(err);
  }

  return receipt;
}
