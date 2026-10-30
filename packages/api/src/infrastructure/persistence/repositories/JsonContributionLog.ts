import type { ContributionEvent, IContributionLog } from '../../../domain/listing/ContributionLog';
import type { IDocumentStore } from '../DocumentStore';

export const CONTRIBUTIONS_KEY = 'contributions.json';

export class JsonContributionLog implements IContributionLog {
  private readonly rows: ContributionEvent[];

  constructor(private readonly store: IDocumentStore) {
    this.rows = store.read<ContributionEvent[]>(CONTRIBUTIONS_KEY, []);
  }

  append(event: ContributionEvent): void {
    this.rows.push(event);
    this.store.write(CONTRIBUTIONS_KEY, this.rows);
  }

  forListing(listingId: string): ContributionEvent[] {
    return this.rows.filter((r) => r.listingId === listingId);
  }
}
