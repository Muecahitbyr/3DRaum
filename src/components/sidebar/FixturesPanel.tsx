import { FIXTURE_CATALOG, FIXTURE_TYPES } from '../../config/fixtures';
import type { CollisionSeverity } from '../../collision';
import type { FixtureType, RoomFixture } from '../../types/fixture';
import { getFixtureDisplayName } from '../../utils/fixtures';
import type { RoomModel } from '../../utils/room/model';
import { Button } from '../ui/Button';
import { FixtureIcon } from './FixtureIcon';
import styles from './OpeningsPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface FixturesPanelProps {
  fixtures: readonly RoomFixture[];
  selectedFixtureId: string | null;
  severityById: ReadonlyMap<string, CollisionSeverity>;
  /** Für die Wandbezeichnung in der Liste. */
  room: RoomModel;
  onAdd: (type: FixtureType) => void;
  onSelect: (id: string) => void;
}

/** Kurzbezeichnungen für die Hinzufügen-Buttons (schmale Sidebar). */
const SHORT_LABELS: Record<FixtureType, string> = { radiator: 'Heizkörper', socket: 'Steckdose', switch: 'Schalter' };

/** Sidebar-Bereich „Raumobjekte“: feste, wandgebundene Objekte. */
export function FixturesPanel({ fixtures, selectedFixtureId, severityById, room, onAdd, onSelect }: FixturesPanelProps) {
  return (
    <SidebarSection title="Raumobjekte" testId="fixtures-panel">
      <div className={styles.actions3}>
        {FIXTURE_TYPES.map((type) => (
          <Button key={type} onClick={() => onAdd(type)} data-testid={`add-${type}`} title={`${FIXTURE_CATALOG[type].label} hinzufügen`}>
            <FixtureIcon type={type} />
            {SHORT_LABELS[type]}
          </Button>
        ))}
      </div>
      {fixtures.length === 0 ? (
        <p className={styles.empty}>Noch keine Heizkörper, Steckdosen oder Schalter.</p>
      ) : (
        <ul className={styles.list} aria-label="Platzierte Raumobjekte">
          {fixtures.map((fixture) => (
            <li key={fixture.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={fixture.id === selectedFixtureId}
                onClick={() => onSelect(fixture.id)}
                data-testid="fixture-list-item"
              >
                <FixtureIcon type={fixture.type} />
                <span className={styles.itemName}>{getFixtureDisplayName(fixture, fixtures)}</span>
                {severityById.has(fixture.id) && (
                  <span className={styles.status} data-severity={severityById.get(fixture.id)} aria-label="Kollision" />
                )}
                <span className={styles.itemMeta}>{room.wallById.get(fixture.wall)?.label.split(' (')[0]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
