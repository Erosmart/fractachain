/**
 * Live testnet receipts for the Genesis demo.
 *
 * Primary subscription (`contribute`) is still sandbox accounting. When the
 * listing has a real issuer and the investor has a custodial key, we also
 * submit a trustline so the jury can open a Stellar Expert hash.
 */
import { rpc } from '@stellar/stellar-sdk';
import { getListing } from '../admin/listings';
import { getTestnetConfig } from '../admin/testnet';
import { addTrustline, getAccount } from '../auth/accounts';
import { openCustodialTrustline, sdexAvailable } from '../market/sdex_book';
import { loadTestnetDeployment } from './deployment';

const EXPERT = 'https://stellar.expert/explorer/testnet';

export function explorerContract(id?: string | null) {
  return id ? `${EXPERT}/contract/${id}` : null;
}

export function explorerTx(hash?: string | null) {
  return hash ? `${EXPERT}/tx/${hash}` : null;
}

export async function getOnChainStatus() {
  const deployment = loadTestnetDeployment();
  const cfg = getTestnetConfig();
  let ledger: number | null = null;
  let rpcOk = false;
  let error: string | undefined;
  try {
    const srv = new rpc.Server(cfg.rpcUrl);
    const latest = await srv.getLatestLedger();
    ledger = latest.sequence;
    rpcOk = true;
  } catch (err: any) {
    error = err?.message || String(err);
  }
  return {
    network: deployment?.network || 'testnet',
    onChain: Boolean(deployment?.licitacion?.startsWith('C')),
    rpcOk,
    ledger,
    error,
    factory: deployment?.factory || null,
    licitacion: deployment?.licitacion || null,
    stockVault: deployment?.stockVault || null,
    issuer: deployment?.issuer || null,
    explorer: {
      factory: explorerContract(deployment?.factory),
      licitacion: explorerContract(deployment?.licitacion),
      stockVault: explorerContract(deployment?.stockVault),
    },
  };
}

export async function receiptAfterContribute(listingId: string, accountId: string) {
  const listing = getListing(listingId);
  const deployment = loadTestnetDeployment();
  const account = getAccount(accountId);
  const licitacion = listing?.licitacionContract || deployment?.licitacion || null;
  const receipt: {
    sandboxPrimary: boolean;
    network: string;
    licitacion: string | null;
    explorer: string | null;
    trustlineHash: string | null;
    trustlineExplorer: string | null;
    note: string;
    trustlineError?: string;
  } = {
    sandboxPrimary: true,
    network: 'testnet',
    licitacion,
    explorer: explorerContract(licitacion),
    trustlineHash: null,
    trustlineExplorer: null,
    note: 'El aporte primario queda en el backend. Si hay wallet custodial y emisor Stellar, la trustline sí se manda a testnet.',
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
    if (result.hash) {
      receipt.note =
        'Aporte sandbox + trustline en Stellar testnet. Abrí el hash en Stellar Expert.';
    }
  } catch (err: any) {
    receipt.trustlineError = err?.message || String(err);
  }

  return receipt;
}
