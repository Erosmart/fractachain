/**
 * Pure helpers for the licitacion lifecycle. The live Soroban contract
 * (`finalize`) only closes when:
 *
 *   raised >= hard_cap  OR  now >= deadline
 *
 * Then it pays the fiduciary if raised >= soft_cap, otherwise it fails and
 * contributors call `refund`. Soft cap alone never closes an open offering.
 */

export const LICITACION_STATE = {
  Open: 0,
  Successful: 1,
  Failed: 2,
  Terminated: 3,
} as const;

export type LicitacionStateName = keyof typeof LICITACION_STATE;

const NAME_BY_VALUE: Record<number, LicitacionStateName> = {
  0: 'Open',
  1: 'Successful',
  2: 'Failed',
  3: 'Terminated',
};

export function parseLicitacionState(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'string') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && raw.trim() !== '') return asNum;
    if (raw in LICITACION_STATE) return LICITACION_STATE[raw as LicitacionStateName];
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const tag = rec.tag ?? rec.name;
    if (typeof tag === 'string' && tag in LICITACION_STATE) {
      return LICITACION_STATE[tag as LicitacionStateName];
    }
    if (typeof rec.value === 'number') return rec.value;
  }
  return -1;
}

export function licitacionStateName(state: number): LicitacionStateName | 'Unknown' {
  return NAME_BY_VALUE[state] || 'Unknown';
}

export function listingDeadlineMs(input: {
  settleAt?: string;
  listedAt?: string;
  offeringDays?: number;
}): number | null {
  if (input.settleAt) {
    const ms = new Date(input.settleAt).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (input.listedAt && input.offeringDays && input.offeringDays > 0) {
    const listed = new Date(input.listedAt).getTime();
    if (!Number.isFinite(listed)) return null;
    return listed + input.offeringDays * 86_400_000;
  }
  return null;
}

export type FinalizeGate = {
  canFinalize: boolean;
  reason: 'hard_cap' | 'deadline' | 'waiting' | 'not_open' | 'already_closed';
};

/**
 * Mirrors `finalize` in contracts/fractachain-licitacion/src/lib.rs:
 * hard cap or deadline, not soft cap by itself.
 */
export function canFinalizeFromSnapshot(input: {
  state: number;
  raised: number;
  hardCap: number;
  deadlineMs: number | null;
  nowMs?: number;
}): FinalizeGate {
  if (input.state === LICITACION_STATE.Successful || input.state === LICITACION_STATE.Failed || input.state === LICITACION_STATE.Terminated) {
    return { canFinalize: false, reason: 'already_closed' };
  }
  if (input.state !== LICITACION_STATE.Open) {
    return { canFinalize: false, reason: 'not_open' };
  }
  if (input.hardCap > 0 && input.raised + 1e-9 >= input.hardCap) {
    return { canFinalize: true, reason: 'hard_cap' };
  }
  const now = input.nowMs ?? Date.now();
  if (input.deadlineMs != null && now >= input.deadlineMs) {
    return { canFinalize: true, reason: 'deadline' };
  }
  return { canFinalize: false, reason: 'waiting' };
}

export function expectedCloseStatus(input: {
  state: number;
  raised: number;
  softCap: number;
}): 'CLOSED_SUCCESS' | 'CLOSED_FAILED' | null {
  if (input.state === LICITACION_STATE.Successful) return 'CLOSED_SUCCESS';
  if (input.state === LICITACION_STATE.Failed) return 'CLOSED_FAILED';
  if (input.state === LICITACION_STATE.Terminated) return 'CLOSED_SUCCESS';
  if (input.state === LICITACION_STATE.Open) {
    return input.softCap > 0 && input.raised + 1e-9 >= input.softCap
      ? 'CLOSED_SUCCESS'
      : 'CLOSED_FAILED';
  }
  return null;
}
