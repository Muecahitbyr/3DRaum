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
}

export function OpeningsPanel({ openings, selectedOpeningId, severityById, room, onAdd, onSelect }: OpeningsPanelProps) {
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
