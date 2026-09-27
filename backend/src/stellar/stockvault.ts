/**
 * Per-listing stock vault on Soroban.
 *
 * Same lesson as the licitación fix: `deploy` used to point every listing at
 * the shared `deployments/testnet.json` vault, so the second listing would
 * mint against the first one's custody counters. Each listing now gets its
 * own vault instance, initialized with its own ticker/ISIN and a fresh PoR
 * attestation, so `mint_backed_stock` mints 1:1 against *that* dossier.
 */
import { createHash } from 'crypto';
import { Listing } from '../admin/listings';
import { isStellarPublicKey } from '../auth/stellar_testnet';
import { loadTestnetDeployment } from './deployment';
import { licitacionAdminKeypair, porOracleKeypair } from './keys';
import {
  contractClient,
  deployFromWasmHash,
  factoryId,
  invoke,
  isLiveContractId,
  wasmHashOf,
} from './soroban';


/** True when there is a stock-vault WASM on testnet to instantiate from. */
export function canDeployStockVault(): boolean {
  const d = loadTestnetDeployment();
  return Boolean(d?.stockVaultWasmHash || isLiveContractId(d?.stockVault));
}

/** Soroban `Symbol` arg: a-zA-Z0-9_, max 32 chars. */
function vaultSymbol(code: string): string {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 32);
  return clean || 'TOKEN';
}

/** Caja de Valores attestation as the BytesN<32> the contract expects. */
function cvHash(listing: Listing): Buffer {
  const raw = String(listing.cvDepositHash || '');
  const buf = Buffer.from(raw, 'hex');
  return buf.length === 32 ? buf : createHash('sha256').update(raw || listing.id).digest();
}

/**
 * Deploys a fresh stock-vault instance for the listing and initializes it:
 * registry = the issuance factory, payment token = USDC SAC (dividends settle
 * in USDC), PoR oracle = the provisioned oracle account. Right after init it
 * attests `sharesToTokenize` in custody so `mint_backed_stock` can run.
 */
export async function deployStockVaultForListing(
  listing: Listing,
): Promise<{ contractId: string; hash: string | null }> {
  const d = loadTestnetDeployment();
  const wasmHash =
    d?.stockVaultWasmHash ||
    (isLiveContractId(d?.stockVault) ? await wasmHashOf(d!.stockVault!) : '');
  if (!wasmHash) {
    throw new Error('deployments/testnet.json no tiene el WASM del stock vault');
  }
  const paymentToken = d?.usdcSac;
  if (!isLiveContractId(paymentToken)) {
    throw new Error('Falta usdcSac en deployments/testnet.json');
  }

  const admin = await licitacionAdminKeypair();
  const oracle = await porOracleKeypair();
  if (oracle.publicKey() === admin.publicKey()) {
    throw new Error('El oráculo PoR no puede ser la misma cuenta que el custodio');
  }

  const meta = listing.dossier;
  const deployed = await deployFromWasmHash(wasmHash, admin);
  const client = await contractClient(deployed.contractId, admin);
  await invoke(client, 'initialize_stock', {
    admin: admin.publicKey(),
    por_oracle: oracle.publicKey(),
    registry: factoryId(),
    payment_token: paymentToken,
    ticker: vaultSymbol(meta.tokenTicker || meta.ticker),
    company_name: meta.legalName || meta.tradeName || meta.tokenTicker,
    isin: meta.isin || '',
    custodian_cuit: meta.custodianCuit || '',
  });
  // The CdV deposit precedes minting: this PoR attestation is what unblocks
  // mint_backed_stock's `minted <= custodied` check for this listing.
  await invoke(
    client,
    'update_proof_of_reserve',
    {
      oracle: oracle.publicKey(),
      shares_in_cv: BigInt(Math.round(meta.sharesToTokenize)),
      audit_hash: cvHash(listing),
    },
    [oracle],
  );
  return { contractId: deployed.contractId, hash: deployed.hash };
}

/**
 * Mints `amount` backed tokens on the listing's own vault, credited to the
 * issuer account (the custody float). `cv_deposit_hash` ties the mint to the
 * dossier's Caja de Valores slip recorded at deploy time.
 */
export async function mintBackedStockOnChain(
  listing: Listing,
  amount: number,
): Promise<{ hash: string | null; to: string; contractId: string } | null> {
  if (!isLiveContractId(listing.stockContract)) return null;
  const admin = await licitacionAdminKeypair();
  const client = await contractClient(listing.stockContract, admin);
  const to = isStellarPublicKey(listing.dossier.issuerPublicKey)
    ? listing.dossier.issuerPublicKey
    : admin.publicKey();
  const { hash } = await invoke(client, 'mint_backed_stock', {
    admin: admin.publicKey(),
    to,
    amount: BigInt(Math.round(amount)),
    cv_deposit_hash: cvHash(listing),
  });
  return { hash, to, contractId: listing.stockContract };
}
