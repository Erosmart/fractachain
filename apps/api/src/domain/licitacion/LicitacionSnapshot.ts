export type LicitacionSnapshot = {
  live: boolean;
  state: number;
  stateName: string;
  raised: number;
  price: number;
  proceedsWithdrawn: boolean;
  fiduciary: string | null;
  investorRwa: number | null;
  canFinalize: boolean;
  finalizeReason: string;
  deadline: string | null;
  /** XLM actually sitting in the wallet the contract pays. */
  fiduciaryXlm?: number | null;
  /** USDC sitting in the fiduciary wallet, when the offering bills in USDC. */
  fiduciaryUsdc?: number | null;
  /** The dossier wallet differs from the address `finalize()` pays. */
  fiduciaryMismatch?: boolean;
  error?: string;
};

export interface LicitacionReads {
  state: number;
  raised: number;
  price: number;
  proceedsWithdrawn: boolean;
  fiduciary: string | null;
  investorRwa: number | null;
}

/** Successful (1), Failed (2) or Terminated (3): `finalize()` already ran. */
export function alreadyClosedOnChain(snapshot: Pick<LicitacionSnapshot, 'state'>): boolean {
  return snapshot.state === 1 || snapshot.state === 2 || snapshot.state === 3;
}
