/** Time source. Injected so expiry and deadline logic can be tested deterministically. */
export interface IClock {
  now(): number;
  isoNow(): string;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }

  isoNow(): string {
    return new Date().toISOString();
  }
}
