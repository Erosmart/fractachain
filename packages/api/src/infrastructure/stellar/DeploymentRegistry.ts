import fs from 'fs';
import path from 'path';
import { isContractId } from '../../domain/stellar/StellarAddress';

/**
 * Public IDs of the last testnet deploy (`scripts/testnet/03-deploy.sh`).
 * No secrets — safe to show in the admin UI.
 */
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
  stockVaultWasmHash?: string;
  forward?: string;
  warrant?: string;
  warrantFactory?: string;
  /** Set by `testnet:clone-factory`: the shared factory this local copy replaced. */
  sharedFactory?: string;
  forwardWasmHash?: string;
  warrantWasmHash?: string;
  /** Factory WASM for `testnet:clone-factory` (set by `testnet:upload-wasm factory=…`). */
  factoryWasmHash?: string;
  usdcClassic?: { code: string; issuer: string };
}

export interface IDeploymentRegistry {
  load(): TestnetDeployment | null;
  save(partial: Partial<TestnetDeployment>): TestnetDeployment;
  isOnChainDeployed(): boolean;
}

export class FileDeploymentRegistry implements IDeploymentRegistry {
  constructor(private readonly file: string) {}

  load(): TestnetDeployment | null {
    try {
      if (!fs.existsSync(this.file)) return null;
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as TestnetDeployment;
    } catch {
      return null;
    }
  }

  save(partial: Partial<TestnetDeployment>): TestnetDeployment {
    const next: TestnetDeployment = {
      ...(this.load() ?? { network: 'testnet' }),
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2) + '\n');
    return next;
  }

  isOnChainDeployed(): boolean {
    return isContractId(this.load()?.factory);
  }
}
