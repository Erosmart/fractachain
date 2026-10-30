import type { FeatureModule, ModuleDeps } from './types';

/**
 * Deliverable 2 (Instaward 1): non-custodial signing — POST /api/tx/build,
 * POST /api/tx/submit, GET /api/tx/:hash. See docs/instaward-1/plan.md.
 */
export function createTxModule(_deps: ModuleDeps): FeatureModule {
  return { controllers: [] };
}
