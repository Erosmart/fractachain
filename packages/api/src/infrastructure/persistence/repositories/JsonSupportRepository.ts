import type { ISupportRepository, SupportMessage } from '../../../domain/support/SupportMessage';
import type { IDocumentStore } from '../DocumentStore';

export const SUPPORT_KEY = 'support.json';

/** Contact / support messages, newest first. */
export class JsonSupportRepository implements ISupportRepository {
  private readonly rows: SupportMessage[];

  constructor(private readonly store: IDocumentStore) {
    this.rows = store.read<SupportMessage[]>(SUPPORT_KEY, []);
  }

  insert(message: SupportMessage): void {
    this.rows.unshift(message);
    this.store.write(SUPPORT_KEY, this.rows);
  }

  update(message: SupportMessage): void {
    const i = this.rows.findIndex((m) => m.id === message.id);
    if (i >= 0) this.rows[i] = message;
    this.store.write(SUPPORT_KEY, this.rows);
  }

  findById(id: string): SupportMessage | undefined {
    return this.rows.find((m) => m.id === id);
  }

  list(): SupportMessage[] {
    return [...this.rows];
  }
}
