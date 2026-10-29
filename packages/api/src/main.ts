import { ConfigError } from './config/env';
import { handleShutdownSignals, startPlatform } from './platform';

/** API-only server (tests, scripts, split deployments). The product runs it inside the web server. */
startPlatform()
  .then(handleShutdownSignals)
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof ConfigError ? err.message : err);
    process.exit(1);
  });
