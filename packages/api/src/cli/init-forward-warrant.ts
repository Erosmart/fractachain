/**
 * Initializes already-deployed forward/warrant instances (dual auth), using
 * deployments/testnet.json + testnet-actors.local.json.
 *
 *   npm run init:forward-warrant -w @fractachain/api
 */
import { isContractId } from '../domain/stellar/StellarAddress';
import { actorsFile, initializeForward, initializeWarrant, readActor } from './forward-warrant';
import { cliToolkit, runCli } from './toolkit';

runCli(async () => {
  const { deployments, keyring, soroban, logger, config } = cliToolkit();
  const deployment = deployments.load();
  if (!isContractId(deployment?.forward) || !isContractId(deployment?.warrant)) {
    throw new Error('Faltan forward/warrant en deployments/testnet.json');
  }
  const registry = deployment.warrantFactory || deployment.factory;
  if (!isContractId(registry)) throw new Error('Falta factory para initialize');
  const file = actorsFile(config.stellar.deploymentFile);
  const admin = await keyring.licitacionAdmin();
  const producer = readActor(file, 'producer');
  const buyer = readActor(file, 'buyer');
  const warrantera = readActor(file, 'warrantera');

  await initializeForward(soroban, deployment.forward, { registry, producer, buyer, arbiter: admin.publicKey() })
    .then((sent) => logger.info('forward inicializado', { hash: sent.hash }))
    .catch((err) => logger.warn('forward initialize omitido', { err: String(err) }));
  await initializeWarrant(soroban, deployment.warrant, { registry, producer, warrantera })
    .then((sent) => logger.info('warrant inicializado', { hash: sent.hash }))
    .catch((err) => logger.warn('warrant initialize omitido', { err: String(err) }));
});
