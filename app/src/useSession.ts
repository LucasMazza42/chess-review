import { useSyncExternalStore } from 'react';
import { session } from './session';

export function useSession() {
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return session;
}
