/**
 * Instantiate a new Las Lilas licitacion on testnet, paid in native XLM (SAC),
 * with human-scale caps in stroops. Reuses the factory + wasm already on chain.
 *
 *   cd backend && npx ts-node src/stellar/deploy_licitacion.ts
 */
import 'dotenv/config';
import { bindLicitacionForDemo, getListing } from '../admin/listings';
import { isStellarPublicKey } from '../auth/stellar_testnet';
import { saveTestnetDeployment, loadTestnetDeployment } from './deployment';
import { hasDeployerSecret, licitacionAdminKeypair } from './keys';
import {
  contractClient,
  deployFromWasmHash,
  factoryId,
  invoke,
  wasmHashOf,
  xlmSac,
} from './soroban';

const LISTING_ID = 'IPO-SOJA-PERGAMINO-2026';
const PRICE = 100_000_000n; // 10 XLM
const SOFT = 1_000_000_000n; // 100 XLM pitch // 200 XLM
const HARD = 1_000_000_000n; // 100 XLM pitch close-on-one-ticket // 500 XLM
const KIND_LICITACION = 0;
const KIND_XLM = 0;

async function main() {
  const deployment = loadTestnetDeployment();
  if (!deployment?.licitacion) {
    throw new Error('deployments/testnet.json no tiene licitacion de la que copiar el WASM');
  }
  const admin = await licitacionAdminKeypair();
  const wasmHash = await wasmHashOf(deployment.licitacion);
  console.log('wasm hash', wasmHash);

  const deployed = await deployFromWasmHash(wasmHash, admin);
  console.log('instance', deployed.contractId, deployed.hash || '');

  const client = await contractClient(deployed.contractId, admin);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 21 * 86400);
  // finalize() pays this address: it has to be the company's wallet, not the
  // platform deployer, and after the first contribution it can no longer move.
  const proceedsWallet = getListing(LISTING_ID)?.dossier.proceedsWallet;
  const fiduciary = isStellarPublicKey(proceedsWallet)
    ? proceedsWallet!
    : deployment.deployer || admin.publicKey();
  console.log('fiduciary', fiduciary);
  await invoke(client, 'initialize', {
    admin: admin.publicKey(),
    fiduciary,
    payment_token: xlmSac(),
    soft_cap: SOFT,
    hard_cap: HARD,
    deadline,
    price_per_unit: PRICE,
    legal_info: {
      fideicomiso_hash: Buffer.alloc(32, 1),
      cnv_record_id: 'CNV-SANDBOX-1150',
      legal_terms_uri: 'https://example.com/las-lilas/terms',
    },
  });
  console.log('initialized XLM licitacion');

  let productId: number | null = null;
  if (hasDeployerSecret()) {
    try {
      const factory = await contractClient(factoryId(), admin);
      const { result } = await invoke(factory, 'register_product', {
        admin: admin.publicKey(),
        kind: KIND_LICITACION,
        contract_address: deployed.contractId,
        payment_kind: KIND_XLM,
        price_per_unit: PRICE,
        name: 'Las Lilas soja Pergamino',
      });
      productId = Number(result);
      console.log('factory product', productId);
    } catch (err: any) {
      console.warn('factory.register_product skipped:', err?.message || err);
    }
  } else {
    console.warn('factory.register_product skipped: no STELLAR_DEPLOYER_SECRET');
  }

  const saved = saveTestnetDeployment({
    licitacionLegacy: deployment.licitacion,
    licitacion: deployed.contractId,
    licitacionWasmHash: wasmHash,
  });
  bindLicitacionForDemo(LISTING_ID, deployed.contractId, { factoryProductId: productId });
  console.log('bound', LISTING_ID, '→', saved.licitacion);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
