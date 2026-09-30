import type { ReactNode } from 'react';
import type { ViewMode } from '../../types/view';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import styles from './Workspace.module.css';

const VIEW_MODE_OPTIONS: readonly SegmentedOption<ViewMode>[] = [
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
];

type Mode3d = 'edit' | 'preview';
const MODE_3D_OPTIONS: readonly SegmentedOption<Mode3d>[] = [
  { value: 'edit', label: 'Bearbeiten' },
  { value: 'preview', label: 'Vorschau' },
];

const CONTROL_HINTS: Record<ViewMode, readonly [action: string, key: string][]> = {
  '3d': [
    ['drehen', 'Links'],
    ['verschieben', 'Rechts'],
    ['zoomen', 'Mausrad'],
    ['auswählen', 'Klick'],
  ],
  '2d': [
    ['verschieben', 'Ziehen'],
    ['zoomen', 'Mausrad'],
    ['auswählen', 'Klick'],
    ['Mehrfachauswahl', 'Shift + Klick/Ziehen'],
  ],
};

interface WorkspaceProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Werkzeuge oben links (z. B. Rückgängig/Wiederholen). */
  actions?: ReactNode;
  /** Werkzeuge oben rechts (z. B. Projekt speichern/öffnen). */
  trailing?: ReactNode;
  /** Kurzmeldung über der Arbeitsfläche (z. B. abgelehnte Grundriss-Änderung). */
  notice?: ReactNode;
  /** 3D: Vorschau statt Bearbeiten. */
  preview?: boolean;
  onPreviewChange?: (preview: boolean) => void;
  children: ReactNode;
}

/** Container der Arbeitsfläche: Ansichtsumschalter oben, dezente Bedienhinweise unten. */
export function Workspace({ viewMode, onViewModeChange, actions, trailing, notice, preview = false, onPreviewChange, children }: WorkspaceProps) {
  const previewing = viewMode === '3d' && preview;
  return (
    <>
      <div className={styles.viewport}>{children}</div>
      {actions && <div className={styles.actions} data-preview={previewing}>{actions}</div>}
      {trailing && <div className={styles.trailing}>{trailing}</div>}
      {notice}
      <div className={styles.toolbar}>
        <SegmentedControl
          label="Ansicht"
          options={VIEW_MODE_OPTIONS}
          value={viewMode}
          onChange={onViewModeChange}
        />
        {viewMode === '3d' && onPreviewChange && (
          <SegmentedControl
            label="3D-Modus"
            options={MODE_3D_OPTIONS}
            value={preview ? 'preview' : 'edit'}
            onChange={(mode) => onPreviewChange(mode === 'preview')}
            testId="view-3d-mode"
          />
        )}
      </div>
      <div className={styles.hint} aria-hidden="true" hidden={previewing}>
        {CONTROL_HINTS[viewMode].map(([action, key]) => (
          <span key={action}>
            <strong>{key}</strong> {action}
          </span>
        ))}
      </div>
    </>
  );
}
