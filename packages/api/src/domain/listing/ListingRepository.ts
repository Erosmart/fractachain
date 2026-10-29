import type { Listing } from './Listing';

export interface IListingRepository {
  findById(id: string): Listing | undefined;
  /** All listings, in storage order (newest first). */
  list(): Listing[];
  insert(listing: Listing): void;
  /** Persists the collection; `listing` documents which entity changed. */
  save(listing?: Listing): void;
}
