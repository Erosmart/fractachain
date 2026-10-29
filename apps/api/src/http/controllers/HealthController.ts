import type { Router } from 'express';
import type { IDeploymentRegistry } from '../../infrastructure/stellar/DeploymentRegistry';
import type { Controller } from './Controller';

export class HealthController implements Controller {
  constructor(private readonly deployments: IDeploymentRegistry) {}

  register(r: Router): void {
    r.get('/health', (_req, res) => {
      const onChain = this.deployments.isOnChainDeployed();
      res.json({
        status: 'online',
        service: 'Fractachain API',
        protocol: 'Stellar & Soroban Protocol 28',
        network: onChain
          ? 'Stellar Testnet (on-chain contracts loaded)'
          : 'Stellar Testnet (sandbox until deployments/testnet.json exists)',
        onChain,
        timestamp: new Date().toISOString(),
      });
    });
  }
}
