import { useEffect, useState } from 'react';

/** Reagiert auf eine CSS-Media-Query (z. B. schmaler Bildschirm). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Ab dieser Breite und darunter ist die Sidebar ein ausklappbares Panel (Drawer). */
export const COMPACT_QUERY = '(max-width: 900px)';
