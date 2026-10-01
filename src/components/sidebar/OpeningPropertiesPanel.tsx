import { OPENING_INPUT_STEP, OPENING_TYPE_LABELS } from '../../config/openings';
import type { DoorHinge, DoorSwing, Opening, OpeningPatch } from '../../types/opening';
import { offsetForReadingDistance, readingDistances, readingSides } from '../../utils/room/measurements';
import { offsetFromReading, readingOffset, type RoomModel } from '../../utils/room/model';
import { getOpeningDisplayName } from '../../utils/openingLabels';
import type { CollisionMessage } from '../../collision';
import { getOpeningLimits } from '../../utils/openings';
import { Button } from '../ui/Button';
import { ChoiceField } from '../ui/ChoiceField';
import { CollisionNotices } from '../ui/CollisionNotices';
import { MeasurementInput } from '../ui/MeasurementInput';
import { SelectField } from '../ui/SelectField';
import { OpeningIcon } from './OpeningIcon';
import styles from './OpeningPropertiesPanel.module.css';
import { SidebarSection } from './SidebarSection';

const HINGE_OPTIONS = [
  { value: 'left', label: 'Links' },
  { value: 'right', label: 'Rechts' },
] as const satisfies readonly { value: DoorHinge; label: string }[];
const SWING_OPTIONS = [
  { value: 'inward', label: 'Innen' },
  { value: 'outward', label: 'Außen' },
] as const satisfies readonly { value: DoorSwing; label: string }[];
const SASH_OPTIONS = [
  { value: '1', label: 'Einflügelig' },
  { value: '2', label: 'Zweiflügelig' },
] as const;

interface OpeningPropertiesPanelProps {
  opening: Opening;
  openings: readonly Opening[];
  room: RoomModel;
  /** Kollisionsmeldungen aus dem zentralen Kollisionsbericht. */
  collisionMessages: readonly CollisionMessage[];
  onChange: (id: string, patch: OpeningPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function OpeningPropertiesPanel({
  opening,
  openings,
  room,
  collisionMessages,
  onChange,
  onDelete,
  onClose,
}: OpeningPropertiesPanelProps) {
  const limits = getOpeningLimits(opening, room);
  const update = (patch: OpeningPatch) => onChange(opening.id, patch);
  const wall = room.wallById.get(opening.wall);
  const wallOptions = room.walls.map((w) => ({ value: w.id, label: w.label }));
  // Breite ändern: Die im Grundriss linke bzw. obere Kante bleibt stehen (wie bisher).
  const changeWidth = (width: number) =>
    update(wall?.readingReversed ? { width, offset: opening.offset + opening.width - width } : { width });
  // Wandwechsel: Die angezeigte Position („von links/oben“) bleibt erhalten.
  const changeWall = (id: string) => {
    const target = room.wallById.get(id);
    if (!wall || !target) return update({ wall: id });
    update({ wall: id, offset: offsetFromReading(target, readingOffset(wall, opening.offset, opening.width), opening.width) });
  };
  const name = getOpeningDisplayName(opening, openings);

  return (
    <SidebarSection
      title="Eigenschaften"
      testId="opening-properties"
      action={
        <Button variant="icon" onClick={onClose} aria-label="Auswahl aufheben" title="Auswahl aufheben">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="m3 3 8 8M11 3l-8 8" />
          </svg>
        </Button>
      }
    >
      <div className={styles.name} data-testid="opening-name">
        <OpeningIcon type={opening.type} />
        {name}
      </div>

      <SelectField<string> label="Wand" value={opening.wall} options={wallOptions} onChange={changeWall} />

      {/* Lagemaße zu beiden Wandecken (Grundriss-Leserichtung); intern bleibt es eine Position ab Wandanfang. */}
      {wall && (
        <div className={styles.positionRow}>
          {(['start', 'end'] as const).map((side) => (
            <MeasurementInput
              key={`${opening.id}-${side}-${opening.wall}`}
              label={`Abstand von ${readingSides(wall)[side]}`}
              value={readingDistances(wall, opening)[side]}
              {...limits.offset}
              step={OPENING_INPUT_STEP}
              onChange={(value) => update({ offset: offsetForReadingDistance(wall, opening.width, side, value) })}
            />
          ))}
        </div>
      )}

      <div className={styles.row}>
        <MeasurementInput
          key={`${opening.id}-width`}
          label="Breite"
          value={opening.width}
          {...limits.width}
          step={OPENING_INPUT_STEP}
          onChange={changeWidth}
        />
        <MeasurementInput
          key={`${opening.id}-height`}
          label="Höhe"
          value={opening.height}
          {...limits.height}
          step={OPENING_INPUT_STEP}
          onChange={(height) => update({ height })}
        />
      </div>

      {opening.type === 'door' && (
        <div className={styles.row}>
          <ChoiceField<DoorHinge>
            label="Anschlag"
            options={HINGE_OPTIONS}
            value={opening.hinge}
            onChange={(hinge) => update({ hinge })}
            testId="door-hinge"
          />
          <ChoiceField<DoorSwing>
            label="Öffnet nach"
            options={SWING_OPTIONS}
            value={opening.swing}
            onChange={(swing) => update({ swing })}
            testId="door-swing"
          />
        </div>
      )}
      {opening.type === 'door' && <p className={styles.hint}>Anschlag vom Raum aus auf die Wand gesehen.</p>}
      {opening.type === 'passage' && <p className={styles.hint}>Wandöffnung ohne Tür, z. B. zur offenen Küche.</p>}

      {opening.type === 'window' && (
        <ChoiceField<'1' | '2'>
          label="Fensterart"
          options={SASH_OPTIONS}
          value={String(opening.sashes) as '1' | '2'}
          onChange={(value) => update({ sashes: value === '2' ? 2 : 1 })}
          testId="window-sashes"
        />
      )}

      {opening.type === 'window' && limits.sillHeight && (
        <MeasurementInput
          key={`${opening.id}-sill`}
          label="Brüstungshöhe"
          value={opening.sillHeight}
          {...limits.sillHeight}
          step={OPENING_INPUT_STEP}
          onChange={(sillHeight) => update({ sillHeight })}
        />
      )}

      <CollisionNotices messages={collisionMessages} />

      <div className={styles.footer}>
        <Button variant="danger" block onClick={() => onDelete(opening.id)} data-testid="delete-opening">
          {OPENING_TYPE_LABELS[opening.type]} löschen
        </Button>
      </div>
    </SidebarSection>
  );
}
