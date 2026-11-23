/**
 * Instantiates forward + warrant from the WASM hashes in the deployment file.
 * Constructor WASMs are deployed by the factory (`deploy_forward` /
 * `deploy_warrant`), legacy ones are deployed then initialized. Needs
 * STELLAR_DEPLOYER_SECRET to accredit the warrantera on the configured
 * factory; without it a private factory is deployed for the demo.
 *
 *   npm run deploy:forward-warrant -w @fractachain/api
 */
import fs from 'fs';
import { Keypair } from '@stellar/stellar-sdk';
import { CONSTRUCTOR, planDeploy } from '../infrastructure/stellar/ContractDeployPlan';
import {
  actorsFile,
  deployForwardViaFactory,
  deployWarrantViaFactory,
  initializeForward,
  initializeWarrant,
  verifyRegistry,
  type Actor,
} from './forward-warrant';
import { cliToolkit, runCli } from './toolkit';

runCli(async () => {
  const { deployments, keyring, soroban, friendbot, logger, config } = cliToolkit();
  const deployment = deployments.load();
  if (!deployment?.forwardWasmHash || !deployment?.warrantWasmHash) {
    throw new Error('Faltan forwardWasmHash / warrantWasmHash en deployments/testnet.json');
  }
  const fundedActor = async (label: string): Promise<Actor> => {
    const kp = Keypair.random();
    if (!(await friendbot.fund(kp.publicKey())).funded)
      throw new Error(`Friendbot no fondeó ${label} ${kp.publicKey()}`);
    return { publicKey: kp.publicKey(), secretKey: kp.secret(), kp };
  };

  const admin = await keyring.licitacionAdmin();
  const producer = await fundedActor('producer');
  const buyer = await fundedActor('buyer');
  const warrantera = await fundedActor('warrantera');

  // Legacy WASMs: deploy and initialize are separate transactions; an
  // instance whose initialize failed (or was front-run) is never saved.
  const deployLegacy = async (wasmHash: string, init: (contractId: string) => Promise<unknown>) => {
    const deployed = await soroban.deployFromWasmHash(wasmHash, admin);
    await init(deployed.contractId);
    return deployed;
  };

  const [forwardFns, warrantFns] = await Promise.all([
    soroban.wasmFunctions(deployment.forwardWasmHash),
    soroban.wasmFunctions(deployment.warrantWasmHash),
  ]);
  const constructorWasm = forwardFns.has(CONSTRUCTOR) || warrantFns.has(CONSTRUCTOR);

  // Registry: the configured factory when we hold its admin key, otherwise a
  // private one (constructor WASMs need a factory that can deploy them).
  let registry = soroban.factoryId();
  if (!keyring.hasDeployer()) {
    const factoryWasm =
      constructorWasm && deployment.factoryWasmHash
        ? deployment.factoryWasmHash
        : await soroban.wasmHashOf(registry);
    const plan = planDeploy('factory', await soroban.wasmFunctions(factoryWasm));
    const cloned =
      plan.kind === 'constructor'
        ? await soroban.deployWithConstructor(factoryWasm, admin, { admin: admin.publicKey() })
        : await soroban.deployFromWasmHash(factoryWasm, admin);
    const factory = await soroban.client(cloned.contractId, admin);
    if (plan.kind === 'legacy') await soroban.invoke(factory, 'initialize', { admin: admin.publicKey() });
    await soroban.invoke(factory, 'set_payment_asset', {
      admin: admin.publicKey(),
      kind: 0,
      token: soroban.xlmSac(),
    });
    registry = cloned.contractId;
  }
  await soroban.invoke(await soroban.client(registry, admin), 'set_warrantera', {
    admin: admin.publicKey(),
    who: warrantera.publicKey,
    allowed: true,
  });
  const factoryFns = await soroban.contractFunctions(registry);

  const forwardPlan = planDeploy('forward', forwardFns, factoryFns);
  const forward =
    forwardPlan.kind === 'factory'
      ? await deployForwardViaFactory(soroban, registry, deployment.forwardWasmHash, {
          admin,
          producer,
          buyer,
          arbiter: admin.publicKey(),
        })
      : await deployLegacy(deployment.forwardWasmHash, (id) =>
          initializeForward(soroban, id, { registry, producer, buyer, arbiter: admin.publicKey() }),
        );
  await verifyRegistry(soroban, forward.contractId, registry);

  const warrantPlan = planDeploy('warrant', warrantFns, factoryFns);
  const warrant =
    warrantPlan.kind === 'factory'
      ? await deployWarrantViaFactory(soroban, registry, deployment.warrantWasmHash, {
          admin,
          producer,
          warrantera,
        })
      : await deployLegacy(deployment.warrantWasmHash, (id) =>
          initializeWarrant(soroban, id, { registry, producer, warrantera }),
        );
  await verifyRegistry(soroban, warrant.contractId, registry);

  const file = actorsFile(config.stellar.deploymentFile);
  const row = (a: Actor) => ({ publicKey: a.publicKey, secretKey: a.secretKey });
  fs.writeFileSync(
    file,
    JSON.stringify({ producer: row(producer), buyer: row(buyer), warrantera: row(warrantera) }, null, 2) +
      '\n',
    { mode: 0o600 },
  );
  deployments.save({ forward: forward.contractId, warrant: warrant.contractId, warrantFactory: registry });
  logger.info('forward + warrant desplegados', {
    forward: forward.contractId,
    warrant: warrant.contractId,
    registry,
    actors: file,
  });
});
