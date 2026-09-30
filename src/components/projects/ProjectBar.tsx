import { Button } from '../ui/Button';
import styles from './ProjectBar.module.css';

export type ProjectStatus = 'new' | 'dirty' | 'saved';

export interface ProjectNotice {
  kind: 'success' | 'warning' | 'error';
  text: string;
}

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  new: 'Noch nicht gespeichert',
  dirty: 'Ungespeicherte Änderungen',
  saved: 'Gespeichert',
};

interface ProjectBarProps {
  name: string;
  status: ProjectStatus;
  /** Wechselt bei jedem erfolgreichen Speichern (kurze Hervorhebung). */
  savedAt: number | null;
  notice: ProjectNotice | null;
  onSave: () => void;
  onOpenProjects: () => void;
  onOpenExport: () => void;
}

const ICONS = {
  save: 'M3 2.5h8l2.5 2.5v8.5h-11zM5 2.5v3.5h5v-3.5M5 13.5v-4.5h6v4.5',
  projects: 'M1.5 4h5l1.5 1.5h6.5v8h-13z',
  export: 'M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 11v2.5h11V11',
};

/** Symbol + Beschriftung; auf schmaler Arbeitsfläche nur das Symbol (Name bleibt per aria-label). */
function Labelled({ icon, children }: { icon: keyof typeof ICONS; children: string }) {
  return (
    <>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" className={styles.icon}>
        <path d={ICONS[icon]} />
      </svg>
      <span className={styles.label}>{children}</span>
    </>
  );
}

export function ProjectBar({ name, status, savedAt, notice, onSave, onOpenProjects, onOpenExport }: ProjectBarProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <div className={styles.info}>
          <span className={styles.name} data-testid="project-name" title={name}>
            {name}
          </span>
          <span
            key={savedAt ?? 'none'}
            className={`${styles.status} ${status === 'saved' && savedAt ? styles.flash : ''}`}
            data-state={status}
            data-testid="project-status"
          >
            <span className={styles.dot} aria-hidden="true" title={STATUS_TEXT[status]} />
            <span className={styles.statusText}>{STATUS_TEXT[status]}</span>
          </span>
        </div>
        <Button variant="primary" onClick={onSave} data-testid="project-save" title="Projekt im Browser speichern (Strg/⌘ + S)" aria-label="Speichern">
          <Labelled icon="save">Speichern</Labelled>
        </Button>
        <Button onClick={onOpenProjects} data-testid="projects-button" title="Gespeicherte Projekte öffnen, neu anlegen, importieren" aria-label="Projekte">
          <Labelled icon="projects">Projekte</Labelled>
        </Button>
        <Button onClick={onOpenExport} data-testid="export-button" title="Grundriss, 3D-Bild, PDF-Bericht oder Projektdatei exportieren" aria-label="Export">
          <Labelled icon="export">Export</Labelled>
        </Button>
      </div>
      {notice && (
        <div className={styles.notice} data-kind={notice.kind} role="status" data-testid="project-notice">
          {notice.text}
        </div>
      )}
    </div>
  );
}
