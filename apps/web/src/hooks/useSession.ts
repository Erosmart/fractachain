import { useEffect, useSyncExternalStore } from 'react';
import { container } from '@/core/container';
import { SERVER_SESSION, type SessionState } from '@/core/auth/SessionStore';

const store = container.stores.session;
const serverSnapshot = () => SERVER_SESSION;

/** Reactive session state, shared by every island on the page. */
export function useSession(): SessionState {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  useEffect(() => {
    container.services.auth.bootstrap();
    container.stores.locale.syncPersistedChoice();
  }, []);
  return state;
}
