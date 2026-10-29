/**
 * Creates a USDC faucet this machine controls: a Friendbot-funded issuer, its
 * Stellar Asset Contract (the token the licitación escrow pulls) and the
 * factory registration — then points the local deployment file at it.
 *
 * For development environments without the team's USDC issuer key. Requires
 * a factory administered by this machine (`testnet:clone-factory`).
 *
 *   npm run testnet:setup-usdc -w @fractachain/api
 */
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { SECRET } from '../infrastructure/stellar/PlatformKeyring';
import { EnvFileSecretStore } from '../infrastructure/stellar/SecretStore';
import { requireLocalDeploymentFile } from './localDeployment';
import { cliToolkit, runCli } from './toolkit';

const USDC_PAYMENT_KIND = 1;

runCli(async () => {
  const { config, deployments, keyring, soroban, friendbot, logger } = cliToolkit();
  requireLocalDeploymentFile(config);

  const issuer = Keypair.random();
  if (!(await friendbot.fund(issuer.publicKey())).funded) throw new Error('Friendbot no fondeó el emisor USDC');
  const asset = new Asset(config.stellar.usdcCode, issuer.publicKey());
  const sac = asset.contractId(config.stellar.networkPassphrase);
  await soroban.submitHostFunction(Operation.createStellarAssetContract({ asset }), issuer);

  const secrets = new EnvFileSecretStore(config.storage.envFile, logger);
  secrets.set(SECRET.usdcIssuer, issuer.secret());
  secrets.set(SECRET.usdcIssuerPublic, issuer.publicKey());

  const admin = await keyring.licitacionAdmin();
  const factory = await soroban.client(soroban.factoryId(), admin);
  await soroban.invoke(factory, 'set_payment_asset', { admin: admin.publicKey(), kind: USDC_PAYMENT_KIND, token: sac });

  deployments.save({ usdcSac: sac, usdcClassic: { code: config.stellar.usdcCode, issuer: issuer.publicKey() } });
  logger.info('USDC propio listo', { issuer: issuer.publicKey(), sac, factory: soroban.factoryId() });
});
