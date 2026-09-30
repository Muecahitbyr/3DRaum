import { useThree, type RootState } from '@react-three/fiber';
import { useEffect } from 'react';

declare global {
  interface Window {
    /** Nur im Dev-Modus: Zugriff auf den R3F-Zustand für Debugging und E2E-Tests. */
    __PLANNER_R3F__?: () => RootState;
  }
}

/** Stellt den R3F-Zustand im Dev-Modus unter `window.__PLANNER_R3F__` bereit. */
export function DevSceneBridge() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    window.__PLANNER_R3F__ = get;
    return () => {
      delete window.__PLANNER_R3F__;
    };
  }, [get]);
  return null;
}
