import type { OpeningType } from '../../types/opening';

/** Kleine Grundriss-Piktogramme für Tür, Fenster und Durchgang. */
export function OpeningIcon({ type }: { type: OpeningType }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {type === 'passage' ? (
        <>
          <path d="M1 8h3.5M11.5 8h3.5" strokeWidth="2.4" />
          <path d="M4.5 5v6M11.5 5v6" />
          <path d="M4.5 8h7" strokeDasharray="1.6 1.4" />
        </>
      ) : type === 'door' ? (
        <>
          <path d="M1.5 14.5h3M11.5 14.5h3" strokeWidth="2" />
          <path d="M4.5 14.5V4.5" strokeWidth="1.8" />
          <path d="M4.5 4.5a10 10 0 0 1 10 10" strokeDasharray="0" />
        </>
      ) : (
        <>
          <path d="M1 6h2M13 6h2M1 10h2M13 10h2" strokeWidth="2" />
          <rect x="3" y="5.5" width="10" height="5" rx="0.5" />
          <path d="M3 8h10" />
        </>
      )}
    </svg>
  );
}
