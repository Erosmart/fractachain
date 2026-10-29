/**
 * Public entry of `@fractachain/api`: everything a host process needs to run
 * the backend — standalone, or inside the Astro server.
 */
export {
  startPlatform,
  handleShutdownSignals,
  type PlatformOptions,
  type RunningPlatform,
} from './startPlatform';
export { createRootApp, apiDispatcher, isApiPath, type WebFrontend } from './RootServer';
export { loadEnvironment } from './environment';
