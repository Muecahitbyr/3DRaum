import { useState, type FormEvent } from 'react';
import { PROJECT_NAME_MAX_LENGTH } from '../../projects/format';
import type { ProjectSummary } from '../../projects/storage';
import { ROOM_SHAPE_LABELS } from '../../config/room';
import type { RoomShape } from '../../types/room';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';

const SHAPE_OPTIONS = (Object.keys(ROOM_SHAPE_LABELS) as RoomShape[]).map((value) => ({ value, label: ROOM_SHAPE_LABELS[value] }));
import { Dialog } from '../ui/Dialog';
import styles from './ProjectsDialog.module.css';

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

interface ProjectsDialogProps {
  projects: readonly ProjectSummary[];
  currentId: string | null;
  error: string | null;
  onOpen: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary, name: string) => boolean;
  onDelete: (project: ProjectSummary) => void;
  /** Neues Projekt mit gewählter Raumform. */
  onNew: (shape: RoomShape) => void;
  onClose: () => void;
}

/** Übersicht der lokal gespeicherten Projekte. */
export function ProjectsDialog({ projects, currentId, error, onOpen, onRename, onDelete, onNew, onClose }: ProjectsDialogProps) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [shape, setShape] = useState<RoomShape>('rectangle');

  const submitRename = (event: FormEvent, project: ProjectSummary) => {
    event.preventDefault();
    if (!renaming || !renaming.name.trim()) return;
    if (onRename(project, renaming.name)) setRenaming(null);
  };

  return (
    <Dialog title="Projekte" onClose={onClose} width={600} testId="projects-dialog">
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {projects.length === 1 ? '1 Projekt' : `${projects.length} Projekte`} · lokal in diesem Browser gespeichert
        </span>
        <div className={styles.newProject}>
          <SegmentedControl label="Raumform für neues Projekt" options={SHAPE_OPTIONS} value={shape} onChange={setShape} variant="field" testId="project-new-shape" />
          <Button variant="primary" onClick={() => onNew(shape)} data-testid="project-new">
            Neues Projekt
          </Button>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {projects.length === 0 ? (
        <p className={styles.empty}>Noch keine gespeicherten Projekte.</p>
      ) : (
        <ul className={styles.list}>
          {projects.map((project) => {
            const isCurrent = project.id === currentId;
            const isRenaming = renaming?.id === project.id;
            return (
              <li key={project.id} className={styles.item} data-current={isCurrent} data-testid="project-item" data-project-id={project.id}>
                {isRenaming ? (
                  <form className={styles.rename} onSubmit={(event) => submitRename(event, project)}>
                    <input
                      aria-label="Neuer Projektname"
                      value={renaming.name}
                      maxLength={PROJECT_NAME_MAX_LENGTH}
                      autoFocus
                      onChange={(event) => setRenaming({ id: project.id, name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          // Nur das Umbenennen abbrechen, nicht den Dialog schließen.
                          event.stopPropagation();
                          event.nativeEvent.stopImmediatePropagation();
                          setRenaming(null);
                        }
                      }}
                      data-testid="project-rename-input"
                    />
                    <Button type="submit" variant="primary" disabled={!renaming.name.trim()} data-testid="project-rename-save">
                      Übernehmen
                    </Button>
                    <Button onClick={() => setRenaming(null)}>Abbrechen</Button>
                  </form>
                ) : (
                  <>
                    <div className={styles.info}>
                      <div className={styles.name}>
                        <span data-testid="project-item-name">{project.name}</span>
                        {isCurrent && <span className={styles.badge}>Geöffnet</span>}
                      </div>
                      {project.valid ? (
                        <div className={styles.meta}>
                          Zuletzt geändert: {project.updatedAt ? dateFormat.format(new Date(project.updatedAt)) : '–'}
                        </div>
                      ) : (
                        <div className={styles.corrupt} data-testid="project-item-error">
                          Nicht lesbar: {project.error}
                        </div>
                      )}
                    </div>
                    <div className={styles.actions}>
                      <Button onClick={() => onOpen(project)} disabled={!project.valid} data-testid="project-open">
                        Öffnen
                      </Button>
                      <Button
                        onClick={() => setRenaming({ id: project.id, name: project.name })}
                        disabled={!project.valid}
                        data-testid="project-rename"
                      >
                        Umbenennen
                      </Button>
                      <Button variant="danger" onClick={() => onDelete(project)} data-testid="project-delete">
                        Löschen
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
