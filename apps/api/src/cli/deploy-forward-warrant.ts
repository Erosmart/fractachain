/**
 * Instantiates forward + warrant from the WASM hashes already on testnet.
 * Needs STELLAR_DEPLOYER_SECRET to accredit the warrantera on the factory;
 * without it a private factory clone is deployed for the demo.
 *
 *   npm run deploy:forward-warrant -w @fractachain/api
 */
import fs from 'fs';
import { Keypair } from '@stellar/stellar-sdk';
import { actorsFile, initializeForward, initializeWarrant, type Actor } from './forward-warrant';
import { cliToolkit, runCli } from './toolkit';

runCli(async () => {
  const { deployments, keyring, soroban, friendbot, logger, config } = cliToolkit();
  const deployment = deployments.load();
  if (!deployment?.forwardWasmHash || !deployment?.warrantWasmHash) {
    throw new Error('Faltan forwardWasmHash / warrantWasmHash en deployments/testnet.json');
  }
  const fundedActor = async (label: string): Promise<Actor> => {
    const kp = Keypair.random();
    if (!(await friendbot.fund(kp.publicKey())).funded) throw new Error(`Friendbot no fondeó ${label} ${kp.publicKey()}`);
    return { publicKey: kp.publicKey(), secretKey: kp.secret(), kp };
  };

  const admin = await keyring.licitacionAdmin();
  const producer = await fundedActor('producer');
  const buyer = await fundedActor('buyer');
  const warrantera = await fundedActor('warrantera');

  let registry = soroban.factoryId();
  if (keyring.hasDeployer()) {
    const factory = await soroban.client(registry, admin);
    await soroban.invoke(factory, 'set_warrantera', { admin: admin.publicKey(), who: warrantera.publicKey, allowed: true });
  } else {
    const cloned = await soroban.deployFromWasmHash(await soroban.wasmHashOf(registry), admin);
    const factory = await soroban.client(cloned.contractId, admin);
    await soroban.invoke(factory, 'initialize', { admin: admin.publicKey() });
    await soroban.invoke(factory, 'set_payment_asset', { admin: admin.publicKey(), kind: 0, token: soroban.xlmSac() });
    await soroban.invoke(factory, 'set_warrantera', { admin: admin.publicKey(), who: warrantera.publicKey, allowed: true });
    registry = cloned.contractId;
  }

  const forward = await soroban.deployFromWasmHash(deployment.forwardWasmHash, admin);
  await initializeForward(soroban, forward.contractId, { registry, producer, buyer, arbiter: admin.publicKey() }).catch((err) =>
    logger.warn('forward initialize omitido', { err: String(err) }),
  );
  const warrant = await soroban.deployFromWasmHash(deployment.warrantWasmHash, admin);
  await initializeWarrant(soroban, warrant.contractId, { registry, producer, warrantera }).catch((err) =>
    logger.warn('warrant initialize omitido', { err: String(err) }),
  );

  const file = actorsFile(config.stellar.deploymentFile);
  const row = (a: Actor) => ({ publicKey: a.publicKey, secretKey: a.secretKey });
  fs.writeFileSync(file, JSON.stringify({ producer: row(producer), buyer: row(buyer), warrantera: row(warrantera) }, null, 2) + '\n', { mode: 0o600 });
  deployments.save({ forward: forward.contractId, warrant: warrant.contractId, warrantFactory: registry });
  logger.info('forward + warrant desplegados', { forward: forward.contractId, warrant: warrant.contractId, registry, actors: file });
});
