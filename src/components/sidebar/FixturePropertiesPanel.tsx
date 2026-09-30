import { FIXTURE_CATALOG } from '../../config/fixtures';
import { OPENING_INPUT_STEP } from '../../config/openings';
import type { CollisionMessage } from '../../collision';
import type { FixturePatch, RoomFixture } from '../../types/fixture';
import { offsetFromReading, readingLabel, readingOffset, type RoomModel } from '../../utils/room/model';
import { getFixtureDisplayName, getFixtureLimits } from '../../utils/fixtures';
import { roundToPrecision } from '../../utils/units';
import { Button } from '../ui/Button';
import { CollisionNotices } from '../ui/CollisionNotices';
import { MeasurementInput } from '../ui/MeasurementInput';
import { SelectField } from '../ui/SelectField';
import { FixtureIcon } from './FixtureIcon';
import styles from './OpeningPropertiesPanel.module.css';
import { SidebarSection } from './SidebarSection';

/** Feinere Schritte als bei Öffnungen – Raumobjekte sind klein. */
const STEP = 0.01;

interface FixturePropertiesPanelProps {
  fixture: RoomFixture;
  fixtures: readonly RoomFixture[];
  room: RoomModel;
  collisionMessages: readonly CollisionMessage[];
  onChange: (id: string, patch: FixturePatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * Eigenschaften eines Raumobjekts. Heizkörper: Größe und Abstand zum Boden.
 * Steckdose/Schalter: feste Größe, Montagehöhe wie üblich bis zur Mitte angegeben.
 */
export function FixturePropertiesPanel({
  fixture,
  fixtures,
  room,
  collisionMessages,
  onChange,
  onDelete,
  onClose,
}: FixturePropertiesPanelProps) {
  const definition = FIXTURE_CATALOG[fixture.type];
  const limits = getFixtureLimits(fixture, room);
  const update = (patch: FixturePatch) => onChange(fixture.id, patch);
  const wall = room.wallById.get(fixture.wall);
  const wallOptions = room.walls.map((w) => ({ value: w.id, label: w.label }));
  // Breite ändern: Die im Grundriss linke bzw. obere Kante bleibt stehen.
  const changeWidth = (width: number) =>
    update(wall?.readingReversed ? { width, offset: fixture.offset + fixture.width - width } : { width });
  const changeWall = (id: string) => {
    const target = room.wallById.get(id);
    if (!wall || !target) return update({ wall: id });
    update({ wall: id, offset: offsetFromReading(target, readingOffset(wall, fixture.offset, fixture.width), fixture.width) });
  };
  const centered = definition.heightReference === 'center';
  const half = fixture.height / 2;

  return (
    <SidebarSection
      title="Eigenschaften"
      testId="fixture-properties"
      action={
        <Button variant="icon" onClick={onClose} aria-label="Auswahl aufheben" title="Auswahl aufheben">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="m3 3 8 8M11 3l-8 8" />
          </svg>
        </Button>
      }
    >
      <div className={styles.name} data-testid="fixture-name">
        <FixtureIcon type={fixture.type} />
        {getFixtureDisplayName(fixture, fixtures)}
      </div>

      <SelectField<string> label="Wand" value={fixture.wall} options={wallOptions} onChange={changeWall} />

      {wall && (
        <MeasurementInput
          key={`${fixture.id}-offset-${fixture.wall}`}
          label={readingLabel(wall)}
          value={readingOffset(wall, fixture.offset, fixture.width)}
          {...limits.offset}
          step={STEP}
          onChange={(value) => update({ offset: offsetFromReading(wall, value, fixture.width) })}
        />
      )}

      {limits.width && limits.height && limits.depth && (
        <>
          <div className={styles.row}>
            <MeasurementInput label="Breite" value={fixture.width} {...limits.width} step={OPENING_INPUT_STEP} onChange={changeWidth} />
            <MeasurementInput label="Höhe" value={fixture.height} {...limits.height} step={OPENING_INPUT_STEP} onChange={(height) => update({ height })} />
          </div>
          <div className={styles.row}>
            <MeasurementInput label="Tiefe" value={fixture.depth} {...limits.depth} step={STEP} onChange={(depth) => update({ depth })} />
            <MeasurementInput
              label="Abstand zum Boden"
              value={fixture.elevation}
              {...limits.elevation}
              step={STEP}
              onChange={(elevation) => update({ elevation })}
            />
          </div>
        </>
      )}

      {centered && (
        <MeasurementInput
          label="Höhe (Mitte)"
          value={roundToPrecision(fixture.elevation + half)}
          min={roundToPrecision(limits.elevation.min + half)}
          max={roundToPrecision(limits.elevation.max + half)}
          step={STEP}
          onChange={(center) => update({ elevation: roundToPrecision(center - half) })}
        />
      )}

      <CollisionNotices messages={collisionMessages} />

      <div className={styles.footer}>
        <Button variant="danger" block onClick={() => onDelete(fixture.id)} data-testid="delete-fixture">
          {definition.label} löschen
        </Button>
      </div>
    </SidebarSection>
  );
}
