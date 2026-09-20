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
  forwardWasmHash?: string;
  warrantWasmHash?: string;
  usdcClassic?: { code: string; issuer: string };
}

const FILE = path.join(__dirname, '..', '..', '..', 'deployments', 'testnet.json');

export function loadTestnetDeployment(): TestnetDeployment | null {
  try {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as TestnetDeployment;
  } catch {
    return null;
  }
}

export function isOnChainDeployed(): boolean {
  const d = loadTestnetDeployment();
  return Boolean(d?.factory && d.factory.startsWith('C'));
}
