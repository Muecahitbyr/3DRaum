import { Button } from '../ui/Button';
import styles from './ProjectBar.module.css';

export type ProjectStatus = 'new' | 'dirty' | 'saved';

export interface ProjectNotice {
  kind: 'success' | 'warning' | 'error';
  text: string;
}

const STATUS_TEXT: Record<ProjectStatus, string> = {
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
}

export function ProjectBar({ name, status, savedAt, notice, onSave, onOpenProjects }: ProjectBarProps) {
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
            <span className={styles.dot} aria-hidden="true" />
            {STATUS_TEXT[status]}
          </span>
        </div>
        <Button variant="primary" onClick={onSave} data-testid="project-save" title="Speichern (Strg/⌘ + S)">
          Speichern
        </Button>
        <Button onClick={onOpenProjects} data-testid="projects-button">
          Projekte
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
