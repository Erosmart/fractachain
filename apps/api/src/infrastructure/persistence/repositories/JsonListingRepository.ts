import type { Listing } from '../../../domain/listing/Listing';
import type { IListingRepository } from '../../../domain/listing/ListingRepository';
import type { IDocumentStore } from '../DocumentStore';

export const LISTINGS_KEY = 'listings.json';

export class JsonListingRepository implements IListingRepository {
  private readonly listings: Listing[];

  constructor(private readonly store: IDocumentStore) {
    this.listings = store.read<Listing[]>(LISTINGS_KEY, []);
  }

  findById(id: string): Listing | undefined {
    return this.listings.find((l) => l.id === id);
  }

  list(): Listing[] {
    return [...this.listings];
  }

  insert(listing: Listing): void {
    this.listings.unshift(listing);
    this.save();
  }

  save(_changed?: unknown): void {
    this.store.write(LISTINGS_KEY, this.listings);
  }
}
