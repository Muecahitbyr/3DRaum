import { OPENING_TYPE_LABELS, OPENING_TYPES } from '../../config/openings';
import type { Opening, OpeningType } from '../../types/opening';
import { getOpeningDisplayName } from '../../utils/openingLabels';
import type { CollisionSeverity } from '../../collision';
import type { RoomModel } from '../../utils/room/model';
import { Button } from '../ui/Button';
import { OpeningIcon } from './OpeningIcon';
import styles from './OpeningsPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface OpeningsPanelProps {
  openings: readonly Opening[];
  selectedOpeningId: string | null;
  severityById: ReadonlyMap<string, CollisionSeverity>;
  /** Für die Wandbezeichnung in der Liste. */
  room: RoomModel;
  onAdd: (type: OpeningType) => void;
  onSelect: (id: string) => void;
  /** Rechtsklick (bzw. Kontextmenü-Taste) auf einen Eintrag: Menü an dieser Bildschirmposition. */
  onContextMenu?: (id: string, x: number, y: number) => void;
}

export function OpeningsPanel({ openings, selectedOpeningId, severityById, room, onAdd, onSelect, onContextMenu }: OpeningsPanelProps) {
  return (
    <SidebarSection title="Bauelemente" testId="openings-panel">
      <div className={styles.actions3}>
        {OPENING_TYPES.map((type) => (
          <Button key={type} onClick={() => onAdd(type)} data-testid={`add-${type}`} title={`${OPENING_TYPE_LABELS[type]} hinzufügen`}>
            <OpeningIcon type={type} />
            {OPENING_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>
      {openings.length === 0 ? (
        <p className={styles.empty}>Noch keine Türen, Fenster oder Durchgänge.</p>
      ) : (
        <ul className={styles.list} aria-label="Platzierte Bauelemente">
          {openings.map((opening) => (
            <li key={opening.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={opening.id === selectedOpeningId}
                onClick={() => onSelect(opening.id)}
                onContextMenu={
                  onContextMenu
                    ? (event) => {
                        event.preventDefault();
                        // Tastatur (Kontextmenü-Taste, Umschalt+F10): keine Zeigerposition → am Eintrag.
                        const rect = event.currentTarget.getBoundingClientRect();
                        const keyboard = event.clientX === 0 && event.clientY === 0;
                        onContextMenu(opening.id, keyboard ? rect.left + 24 : event.clientX, keyboard ? rect.bottom : event.clientY);
                      }
                    : undefined
                }
                onKeyDown={
                  onContextMenu
                    ? (event) => {
                        // Kontextmenü-Taste bzw. Umschalt+F10: Menü am Eintrag.
                        if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
                        event.preventDefault();
                        const rect = event.currentTarget.getBoundingClientRect();
                        onContextMenu(opening.id, rect.left + 24, rect.bottom);
                      }
                    : undefined
                }
                data-testid="opening-list-item"
              >
                <OpeningIcon type={opening.type} />
                <span className={styles.itemName}>{getOpeningDisplayName(opening, openings)}</span>
                {severityById.has(opening.id) && (
                  <span className={styles.status} data-severity={severityById.get(opening.id)} aria-label="Kollision" />
                )}
                <span className={styles.itemMeta}>{room.wallById.get(opening.wall)?.label.split(' (')[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
