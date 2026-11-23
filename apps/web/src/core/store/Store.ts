export type Listener = () => void;

/**
 * Minimal observable state container, shaped for `useSyncExternalStore`.
 *
 * Astro islands are independent React roots, so React context cannot carry
 * app-wide state between them. Module-level stores can: every island on the
 * page imports the same instance from the composition root.
 */
export class Store<TState extends object> {
  private state: TState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: TState) {
    this.state = initial;
  }

  /** Arrow members keep `this` bound when handed to React as callbacks. */
  readonly getSnapshot = (): TState => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected setState(patch: Partial<TState> | ((prev: TState) => TState)): void {
    const next = typeof patch === 'function' ? patch(this.state) : { ...this.state, ...patch };
    if (Object.is(next, this.state)) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}
