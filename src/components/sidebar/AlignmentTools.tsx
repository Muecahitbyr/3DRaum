import type { AlignMode } from '../../utils/furnitureFormation';
import styles from './AlignmentTools.module.css';

const MODES: readonly { mode: AlignMode; label: string; icon: string }[] = [
  { mode: 'left', label: 'Links ausrichten', icon: 'M2.5 1.5v13M5 4.5h8M5 10.5h5' },
  { mode: 'center-x', label: 'Horizontal zentrieren', icon: 'M8 1.5v13M3.5 4.5h9M5 10.5h6' },
  { mode: 'right', label: 'Rechts ausrichten', icon: 'M13.5 1.5v13M3 4.5h8M6 10.5h5' },
  { mode: 'top', label: 'Oben ausrichten', icon: 'M1.5 2.5h13M4.5 5v8M10.5 5v5' },
  { mode: 'center-z', label: 'Vertikal zentrieren', icon: 'M1.5 8h13M4.5 3.5v9M10.5 5v6' },
  { mode: 'bottom', label: 'Unten ausrichten', icon: 'M1.5 13.5h13M4.5 3v8M10.5 6v5' },
];

interface AlignmentToolsProps {
  onAlign: (mode: AlignMode) => void;
}

/**
 * Ausrichten an den Innenwänden (links/rechts/oben/unten im Grundriss) bzw. mittig –
 * bezogen auf die tatsächliche, gedrehte Grundfläche. Mehrere Möbel bleiben
 * dabei zueinander unverändert.
 */
export function AlignmentTools({ onAlign }: AlignmentToolsProps) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Ausrichten im Raum</span>
      <div className={styles.buttons} role="group" aria-label="Ausrichten im Raum">
        {MODES.map(({ mode, label, icon }) => (
          <button key={mode} type="button" className={styles.button} title={label} aria-label={label} onClick={() => onAlign(mode)} data-testid={`align-${mode}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d={icon} />
            </svg>
          </button>
        ))}
      </div>
      <button type="button" className={styles.center} onClick={() => onAlign('center')} data-testid="align-center">
        Im Raum zentrieren
      </button>
    </div>
  );
}
