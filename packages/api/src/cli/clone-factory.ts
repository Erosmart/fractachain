/**
 * Deploys a private copy of the issuance factory (same WASM as the shared
 * testnet one) administered by this machine's licitación admin, registers
 * XLM + USDC as payment assets and points the deployment file at it.
 *
 * For developers without the original deployer key: the shared factory only
 * accepts payment assets its admin registered, so per-listing stock vaults
 * cannot initialize against it. Use with STELLAR_DEPLOYMENT_FILE pointing at
 * a local copy of deployments/testnet.json — never overwrite the shared file.
 *
 *   STELLAR_DEPLOYMENT_FILE=./.local-data/testnet-deployment.json npm run testnet:clone-factory -w @fractachain/api
 */
import { isContractId } from '../domain/stellar/StellarAddress';
import { requireLocalDeploymentFile } from './localDeployment';
import { cliToolkit, runCli } from './toolkit';

const PAYMENT_KIND = { XLM: 0, USDC: 1 } as const;

runCli(async () => {
  const { deployments, keyring, soroban, logger, config } = cliToolkit();
  requireLocalDeploymentFile(config);
  const deployment = deployments.load();
  if (!isContractId(deployment?.factory) || !isContractId(deployment?.usdcSac)) {
    throw new Error('El archivo de deployment no tiene factory / usdcSac');
  }
  const admin = await keyring.licitacionAdmin();
  const wasmHash = await soroban.wasmHashOf(deployment.factory);
  const cloned = await soroban.deployFromWasmHash(wasmHash, admin);
  const factory = await soroban.client(cloned.contractId, admin);
  await soroban.invoke(factory, 'initialize', { admin: admin.publicKey() });
  await soroban.invoke(factory, 'set_payment_asset', {
    admin: admin.publicKey(),
    kind: PAYMENT_KIND.XLM,
    token: soroban.xlmSac(),
  });
  await soroban.invoke(factory, 'set_payment_asset', {
    admin: admin.publicKey(),
    kind: PAYMENT_KIND.USDC,
    token: deployment.usdcSac,
  });
  deployments.save({ factory: cloned.contractId, sharedFactory: deployment.factory });
  logger.info('factory clonada', {
    factory: cloned.contractId,
    admin: admin.publicKey(),
    file: config.stellar.deploymentFile,
  });
});
