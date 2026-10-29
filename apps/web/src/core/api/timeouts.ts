/** Reads and plain writes. */
export const READ_TIMEOUT_MS = 30_000;
/** Anything that submits a Stellar / Soroban transaction and waits for the ledger. */
export const CHAIN_TIMEOUT_MS = 120_000;
/** Admin deploys: several Soroban transactions in one request. */
export const DEPLOY_TIMEOUT_MS = 240_000;

export const enc = encodeURIComponent;
