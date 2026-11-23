/**
 * Uploads contract WASMs built by `stellar contract build` (or
 * `npm run contracts:build`) and records their hashes in the local deployment
 * file, so new listings instantiate the new code. Upload is
 * content-addressed: the hash is the sha256 of the file.
 *
 *   npm run testnet:upload-wasm -w @fractachain/api -- licitacion=path.wasm stockVault=path.wasm …
 *
 * `factory=` only records the hash: `testnet:clone-factory` instantiates it.
 * Constructor-based WASMs are detected from their spec at deploy time.
 */
import crypto from 'crypto';
import fs from 'fs';
import { Operation } from '@stellar/stellar-sdk';
import type { TestnetDeployment } from '../infrastructure/stellar/DeploymentRegistry';
import { requireLocalDeploymentFile } from './localDeployment';
import { cliToolkit, runCli } from './toolkit';

const FIELDS: Record<string, keyof TestnetDeployment> = {
  licitacion: 'licitacionWasmHash',
  stockVault: 'stockVaultWasmHash',
  forward: 'forwardWasmHash',
  warrant: 'warrantWasmHash',
  factory: 'factoryWasmHash',
};

runCli(async () => {
  const { config, deployments, keyring, soroban, logger } = cliToolkit();
  requireLocalDeploymentFile(config);
  const pairs = process.argv.slice(2).map((arg) => arg.split('='));
  if (!pairs.length || pairs.some(([name, file]) => !FIELDS[name] || !file)) {
    throw new Error(
      `Uso: upload-wasm ${Object.keys(FIELDS)
        .map((k) => `${k}=<archivo.wasm>`)
        .join(' ')}`,
    );
  }
  const uploader = await keyring.licitacionAdmin();
  const update: Partial<TestnetDeployment> = {};
  for (const [name, file] of pairs) {
    const wasm = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(wasm).digest('hex');
    await soroban.submitHostFunction(Operation.uploadContractWasm({ wasm }), uploader);
    (update as Record<string, string>)[FIELDS[name]] = hash;
    logger.info('WASM subido', { contract: name, bytes: wasm.length, hash });
  }
  deployments.save(update);
});
