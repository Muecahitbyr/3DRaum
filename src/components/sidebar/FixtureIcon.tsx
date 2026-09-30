import type { FixtureType } from '../../types/fixture';

/** Kleine Piktogramme für Raumobjekte (angelehnt an die Grundriss-Symbole). */
export function FixtureIcon({ type }: { type: FixtureType }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {type === 'radiator' ? (
        <>
          <rect x="1.5" y="4" width="13" height="8" rx="1" />
          <path d="M4.5 4v8M7 4v8M9.5 4v8M12 4v8" strokeWidth="1" />
        </>
      ) : type === 'socket' ? (
        <>
          <path d="M1.5 5h13" strokeWidth="2" />
          <path d="M3.5 5a4.5 4.5 0 0 0 9 0" />
          <path d="M8 9.5v4" />
        </>
      ) : (
        <>
          <path d="M1.5 3h13" strokeWidth="2" />
          <circle cx="8" cy="8.5" r="2.6" />
          <path d="M8 3v3M9.9 10.4l3 3" />
        </>
      )}
    </svg>
  );
}
