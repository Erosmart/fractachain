/**
 * Public IDs of the last Stellar testnet deploy (`scripts/testnet/03-deploy.sh`).
 *
 * Secrets stay in `backend/.env` / the CLI keystore. This file is safe to
 * return to the admin UI and to treat as the source of truth for "are we
 * actually on chain yet".
 */
import fs from 'fs';
import path from 'path';

export interface TestnetDeployment {
  network: string;
  updatedAt?: string;
  horizon?: string;
  rpc?: string;
  passphrase?: string;
  deployer?: string;
  issuer?: string;
  porOracle?: string;
  factory?: string;
  stockVault?: string;
  licitacion?: string;
  usdcSac?: string;
  xlmSac?: string;
  licitacionLegacy?: string;
  licitacionWasmHash?: string;
  forward?: string;
  warrant?: string;
  warrantFactory?: string;
  forwardWasmHash?: string;
  warrantWasmHash?: string;
  usdcClassic?: { code: string; issuer: string };
}

function deploymentFile(): string {
  const fromEnv = String(process.env.STELLAR_DEPLOYMENT_FILE || '').trim();
  if (fromEnv) return fromEnv;
  const candidates = [
    path.join(process.cwd(), 'deployments', 'testnet.json'),
    path.join(__dirname, '..', '..', '..', 'deployments', 'testnet.json'),
    path.join(__dirname, '..', '..', 'deployments', 'testnet.json'),
  ];
  return candidates.find((file) => fs.existsSync(file)) || candidates[0];
}

export function loadTestnetDeployment(): TestnetDeployment | null {
  try {
    const file = deploymentFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as TestnetDeployment;
  } catch {
    return null;
  }
}

export function isOnChainDeployed(): boolean {
  const d = loadTestnetDeployment();
  return Boolean(d?.factory && d.factory.startsWith('C'));
}

export function saveTestnetDeployment(partial: Partial<TestnetDeployment>): TestnetDeployment {
  const current = loadTestnetDeployment() || { network: 'testnet' };
  const next: TestnetDeployment = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  const file = deploymentFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}
