import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { AppAction, AppState, appReducer } from './dispatch';
import { PersistenceStore } from './PersistenceStore';

interface SessionContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  hydrated: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, { session: null, alert: null });
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = React.useState(false);

  useEffect(() => {
    PersistenceStore.load()
      .then(session => dispatch({ type: 'HYDRATED', session }))
      .catch(() => dispatch({ type: 'HYDRATED', session: null }))
      .finally(() => {
        hydratedRef.current = true;
        setHydrated(true);
      });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (state.session) {
      PersistenceStore.save(state.session).catch(() => {
        // Persistence failure must never crash gameplay; state stays live in memory.
      });
    } else {
      PersistenceStore.clear().catch(() => {});
    }
  }, [state.session]);

  return (
    <SessionContext.Provider value={{ state, dispatch, hydrated }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
