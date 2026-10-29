/**
 * Instantiates a new Las Lilas licitación on testnet, paid in native XLM
 * (SAC), reusing the factory + WASM already on chain, and binds the demo
 * listing to it.
 *
 *   npm run deploy:licitacion -w @fractachain/api
 */
import { isContractId, isStellarPublicKey } from '../domain/stellar/StellarAddress';
import { cliToolkit, runCli } from './toolkit';

const LISTING_ID = 'IPO-SOJA-PERGAMINO-2026';
const PRICE = 100_000_000n; // 10 XLM
const SOFT = 1_000_000_000n; // 100 XLM
const HARD = 1_000_000_000n; // 100 XLM — closes on one ticket for the pitch
const KIND_LICITACION = 0;
const KIND_XLM = 0;

runCli(async () => {
  const { deployments, keyring, soroban, listings, logger } = cliToolkit();
  const deployment = deployments.load();
  if (!isContractId(deployment?.licitacion))
    throw new Error('deployments/testnet.json no tiene licitacion de la que copiar el WASM');

  const admin = await keyring.licitacionAdmin();
  const wasmHash = await soroban.wasmHashOf(deployment.licitacion);
  const deployed = await soroban.deployFromWasmHash(wasmHash, admin);
  logger.info('instancia desplegada', { contractId: deployed.contractId, hash: deployed.hash });

  // finalize() pays this address: the company's wallet, frozen after the first contribution.
  const listing = listings.findById(LISTING_ID);
  const fiduciary = isStellarPublicKey(listing?.dossier.proceedsWallet)
    ? listing!.dossier.proceedsWallet
    : deployment.deployer || admin.publicKey();
  const client = await soroban.client(deployed.contractId, admin);
  await soroban.invoke(client, 'initialize', {
    admin: admin.publicKey(),
    fiduciary,
    payment_token: soroban.xlmSac(),
    soft_cap: SOFT,
    hard_cap: HARD,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 21 * 86400),
    price_per_unit: PRICE,
    legal_info: {
      fideicomiso_hash: Buffer.alloc(32, 1),
      cnv_record_id: 'CNV-SANDBOX-1150',
      legal_terms_uri: 'https://example.com/las-lilas/terms',
    },
  });

  let productId: number | null = null;
  if (keyring.hasDeployer()) {
    try {
      const factory = await soroban.client(soroban.factoryId(), admin);
      const { result } = await soroban.invoke(factory, 'register_product', {
        admin: admin.publicKey(),
        kind: KIND_LICITACION,
        contract_address: deployed.contractId,
        payment_kind: KIND_XLM,
        price_per_unit: PRICE,
        name: 'Las Lilas soja Pergamino',
      });
      productId = Number(result);
    } catch (err) {
      logger.warn('factory.register_product omitido', { err: String(err) });
    }
  }

  deployments.save({
    licitacionLegacy: deployment.licitacion,
    licitacion: deployed.contractId,
    licitacionWasmHash: wasmHash,
  });
  if (listing) {
    Object.assign(listing, {
      licitacionContract: deployed.contractId,
      status: 'LISTED',
      raisedUsdc: 0,
      closedAt: undefined,
      proceedsPaidAt: undefined,
      proceedsPaidTo: undefined,
      factoryProductId: productId ?? listing.factoryProductId,
    });
    Object.assign(listing.dossier, {
      paymentKind: 'XLM',
      pricePerShareUsdc: 10,
      minInvestmentUsdc: 100,
      offeringSoftCapUsdc: 100,
      offeringHardCapUsdc: 100,
    });
    listings.save();
  }
  logger.info('licitación XLM lista', { listingId: LISTING_ID, contractId: deployed.contractId, productId });
});
