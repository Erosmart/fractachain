/**
 * Guard for CLIs that rewrite the deployment file: they may only touch a
 * local copy (STELLAR_DEPLOYMENT_FILE), never the shared
 * deployments/testnet.json other developers and the deployed app read.
 */
import path from 'path';
import { REPO_ROOT, type AppConfig } from '../config/env';

export function requireLocalDeploymentFile(config: AppConfig): string {
  if (!config.stellar.isTestnet) throw new Error('Solo para testnet');
  const shared = path.join(REPO_ROOT, 'deployments', 'testnet.json');
  if (!process.env.STELLAR_DEPLOYMENT_FILE || path.resolve(config.stellar.deploymentFile) === shared) {
    throw new Error(
      'Definí STELLAR_DEPLOYMENT_FILE con una copia local de deployments/testnet.json (no se modifica el archivo compartido)',
    );
  }
  return config.stellar.deploymentFile;
}
