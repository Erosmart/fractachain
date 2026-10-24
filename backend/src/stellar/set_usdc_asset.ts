/**
 * Points the platform at the USDC the licitaciones settle in.
 *
 *   npm run usdc:set -- circle            # Circle's testnet USDC (default)
 *   npm run usdc:set -- platform          # fallback: platform-issued USDC
 *   npm run usdc:set -- G…                # any other classic USDC issuer
 *   npm run usdc:set -- circle --dry-run  # print the plan, send nothing
 *
 * Steps: derive the SAC, deploy it if the network does not have it yet, bind
 * it in the factory with `set_payment_asset(Usdc, sac)`, record it in
 * deployments/testnet.json, and — for Circle — make sure the demo pool wallet
 * exists and holds a trustline so it can receive faucet USDC.
 *
 * Instances already initialized keep the token they were created with; only
 * new licitaciones / vaults pick up the new SAC.
 */
import 'dotenv/config';
import { Asset, Keypair, Operation, StrKey, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
import { loadTestnetDeployment, saveTestnetDeployment } from './deployment';
import {
  CIRCLE_TESTNET_USDC_ISSUER,
  deployerKeypair,
  ensureUsdcTreasuryKeypair,
  usdcIssuerKeypair,
} from './keys';
import { contractClient, factoryId, invoke, networkPassphrase, read, rpcServer, SOROBAN_FEE } from './soroban';
import { usdcTreasuryStatus } from './usdc';
import { getTrustlineState } from './sdex';
import { explorerTx } from './onchain';

const PAYMENT_KIND_USDC = 1;

async function resolveIssuer(target: string): Promise<string> {
  if (target === 'circle') return CIRCLE_TESTNET_USDC_ISSUER;
  if (target === 'platform') {
    const current = loadTestnetDeployment()?.usdcClassic?.issuer;
    // usdcIssuerKeypair resolves against deployments first; clear the way to
    // the platform issuer secret (or provision one) instead of Circle's.
    if (current === CIRCLE_TESTNET_USDC_ISSUER) {
      const secret = String(process.env.STELLAR_USDC_ISSUER_SECRET || '').trim();
      if (secret.startsWith('S')) return Keypair.fromSecret(secret).publicKey();
      throw new Error('Para volver al emisor propio configurá STELLAR_USDC_ISSUER_SECRET en backend/.env');
    }
    return (await usdcIssuerKeypair()).publicKey();
  }
  if (StrKey.isValidEd25519PublicKey(target)) return target;
  throw new Error(`Destino inválido "${target}": usá circle, platform o una G… de emisor`);
}

async function sacIsDeployed(sac: string): Promise<boolean> {
  try {
    await rpcServer().getContractData(sac, xdr.ScVal.scvLedgerKeyContractInstance());
    return true;
  } catch {
    return false;
  }
}

async function deploySac(asset: Asset, payer: Keypair): Promise<string> {
  const srv = rpcServer();
  const account = await srv.getAccount(payer.publicKey());
  const tx = new TransactionBuilder(account, { fee: SOROBAN_FEE, networkPassphrase: networkPassphrase() })
    .addOperation(Operation.createStellarAssetContract({ asset }))
    .setTimeout(60)
    .build();
  const prepared = await srv.prepareTransaction(tx);
  prepared.sign(payer);
  const sent = await srv.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error(`La red rechazó el deploy del SAC: ${JSON.stringify(sent.errorResult)}`);
  const settled = await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
  if (settled.status !== 'SUCCESS') throw new Error(`El deploy del SAC terminó en ${settled.status}`);
  return sent.hash;
}

async function ensureTreasuryTrustline(asset: Asset) {
  const treasury = await ensureUsdcTreasuryKeypair();
  const line = await getTrustlineState(treasury.publicKey(), asset);
  if (line.exists) return;
  const srv = rpcServer();
  const account = await srv.getAccount(treasury.publicKey());
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: networkPassphrase() })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();
  tx.sign(treasury);
  const sent = await srv.sendTransaction(tx);
  if (sent.status === 'ERROR') throw new Error(`No se pudo abrir la trustline de la tesorería: ${JSON.stringify(sent.errorResult)}`);
  await srv.pollTransaction(sent.hash, { attempts: 30, sleepStrategy: () => 1000 });
  console.log('trustline tesorería', explorerTx(sent.hash));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find((a) => !a.startsWith('--')) || 'circle';

  const deployment = loadTestnetDeployment();
  const issuer = await resolveIssuer(target);
  const code = deployment?.usdcClassic?.code || process.env.STELLAR_USDC_CODE || 'USDC';
  const asset = new Asset(code, issuer);
  const sac = asset.contractId(networkPassphrase());
  const previous = deployment?.usdcClassic;

  const reader = await contractClient(factoryId());
  const factoryAdmin = String(await read<string>(reader, 'get_admin'));
  const current = await read<string>(reader, 'get_payment_asset', { kind: PAYMENT_KIND_USDC }).catch(() => null);
  const deployed = await sacIsDeployed(sac);

  console.log('USDC        ', `${code}:${issuer}`, issuer === CIRCLE_TESTNET_USDC_ISSUER ? '(Circle)' : '(propio)');
  console.log('SAC         ', sac, deployed ? '(desplegado)' : '(falta desplegar)');
  console.log('factory     ', factoryId(), 'admin', factoryAdmin);
  console.log('factory USDC', current || '(sin configurar)', current === sac ? '= ya apunta acá' : '→ se cambia');
  if (dryRun) {
    console.log('--dry-run: no se envió nada');
    return;
  }

  const admin = deployerKeypair();
  if (factoryAdmin !== admin.publicKey()) {
    throw new Error(`STELLAR_DEPLOYER_SECRET (${admin.publicKey()}) no es el admin de la factory`);
  }
  const factory = await contractClient(factoryId(), admin);

  if (!deployed) console.log('SAC desplegado', explorerTx(await deploySac(asset, admin)));
  if (current !== sac) {
    const { hash } = await invoke(factory, 'set_payment_asset', {
      admin: admin.publicKey(),
      kind: PAYMENT_KIND_USDC,
      token: sac,
    });
    console.log('factory.set_payment_asset', explorerTx(hash));
  }

  saveTestnetDeployment({
    usdcClassic: { code, issuer },
    usdcSac: sac,
    ...(previous && previous.issuer !== issuer ? { usdcClassicLegacy: previous } : {}),
  });
  console.log('deployments/testnet.json actualizado');

  if (issuer === CIRCLE_TESTNET_USDC_ISSUER) await ensureTreasuryTrustline(asset);
  const status = await usdcTreasuryStatus();
  console.log('fondeo      ', status);
  if (status.mode === 'treasury' && status.treasuryBalance < status.grant) {
    console.log(
      `Cargá USDC en la tesorería ${status.treasury} desde https://faucet.circle.com (red Stellar Testnet).`,
    );
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
