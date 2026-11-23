import type { TestnetDeployment } from './DeploymentRegistry';

/** Narrow read-only view of the deployment registry (interface segregation). */
export interface DeploymentRegistryLike {
  load(): TestnetDeployment | null;
}
