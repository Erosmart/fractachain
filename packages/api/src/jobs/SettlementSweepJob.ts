import type { SettlementService } from '../application/settlement/SettlementService';
import { errorMessage } from '../shared/errors';
import type { ILogger } from '../shared/logger';

/** Periodically finalizes offerings whose deadline passed while nobody was looking. */
export class SettlementSweepJob {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly settlement: SettlementService,
    private readonly intervalMs: number,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.intervalMs <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      this.settlement
        .sweepDueOfferings()
        .catch((err) => this.logger.warn('sweep de settlement falló', { err: errorMessage(err) }));
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
