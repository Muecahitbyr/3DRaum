import { FURNITURE_CATALOG, FURNITURE_INPUT_STEP, FURNITURE_ROTATION_STEP } from '../../config/furniture';
import type { CollisionMessage } from '../../collision';
import type { FurnitureGroup, FurnitureItem, FurniturePatch } from '../../types/furniture';
import type { RoomModel } from '../../utils/room/model';
import { getFurnitureLimits } from '../../utils/furniture';
import type { AlignMode } from '../../utils/furnitureFormation';
import { Button } from '../ui/Button';
import { CollisionNotices } from '../ui/CollisionNotices';
import { MeasurementInput } from '../ui/MeasurementInput';
import { TextField } from '../ui/TextField';
import { AlignmentTools } from './AlignmentTools';
import { FurnitureAppearance } from './FurnitureAppearance';
import { FurnitureIcon } from './FurnitureIcon';
import styles from './FurniturePropertiesPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface FurniturePropertiesPanelProps {
  item: FurnitureItem;
  room: RoomModel;
  /** Kollisionsmeldungen aus dem zentralen Kollisionsbericht. */
  collisionMessages: readonly CollisionMessage[];
  /** Gruppe, zu der das Möbel gehört (falls vorhanden). */
  group?: FurnitureGroup | null;
  onChange: (id: string, patch: FurniturePatch) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAlign: (id: string, mode: AlignMode) => void;
  onUngroup?: (groupId: string) => void;
  onClose: () => void;
}

export function FurniturePropertiesPanel({
  item,
  room,
  collisionMessages,
  group = null,
  onChange,
  onDelete,
  onDuplicate,
  onAlign,
  onUngroup,
  onClose,
}: FurniturePropertiesPanelProps) {
  const limits = getFurnitureLimits(item, room);
  const update = (patch: FurniturePatch) => onChange(item.id, patch);
  const step = FURNITURE_INPUT_STEP;

  return (
    <SidebarSection
      title="Eigenschaften"
      testId="furniture-properties"
      action={
        <Button variant="icon" onClick={onClose} aria-label="Auswahl aufheben" title="Auswahl aufheben">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="m3 3 8 8M11 3l-8 8" />
          </svg>
        </Button>
      }
    >
      <TextField label="Name" value={item.name} onChange={(name) => update({ name })} />
      <p className={styles.type} data-testid="furniture-type">
        <FurnitureIcon type={item.type} />
        Typ: {FURNITURE_CATALOG[item.type].label}
      </p>
      <CollisionNotices messages={collisionMessages} />

      <div className={styles.row}>
        <MeasurementInput label="Breite" value={item.width} {...limits.width} step={step} onChange={(width) => update({ width })} />
        <MeasurementInput label="Tiefe" value={item.depth} {...limits.depth} step={step} onChange={(depth) => update({ depth })} />
      </div>
      <div className={styles.row}>
        <MeasurementInput label="Höhe" value={item.height} {...limits.height} step={step} onChange={(height) => update({ height })} />
        <MeasurementInput
          label="Rotation"
          value={item.rotationDeg}
          min={-360}
          max={360}
          step={FURNITURE_ROTATION_STEP}
          unit="°"
          decimals={0}
          onChange={(rotationDeg) => update({ rotationDeg })}
        />
      </div>
      <div className={styles.row}>
        <MeasurementInput
          label="X-Position"
          value={item.position.x}
          {...limits.x}
          step={step}
          onChange={(x) => update({ position: { ...item.position, x } })}
        />
        <MeasurementInput
          label="Z-Position"
          value={item.position.z}
          {...limits.z}
          step={step}
          onChange={(z) => update({ position: { ...item.position, z } })}
        />
      </div>
      <p className={styles.hint}>Mittelpunkt, gemessen ab linker (X) bzw. oberer (Z) Innenwand im Grundriss.</p>

      <FurnitureAppearance item={item} roomHeight={room.dimensions.height} onChange={update} />

      <AlignmentTools onAlign={(mode) => onAlign(item.id, mode)} />

      {group && (
        <div className={styles.group} data-testid="furniture-group-info">
          <span>Teil von „{group.name}“</span>
          {onUngroup && (
            <Button onClick={() => onUngroup(group.id)} data-testid="ungroup-furniture">
              Auflösen
            </Button>
          )}
        </div>
      )}

      <div className={styles.footerRow}>
        <Button onClick={() => onDuplicate(item.id)} title="Duplizieren (Strg/⌘ + D)" data-testid="duplicate-furniture">
          Duplizieren
        </Button>
        <Button variant="danger" onClick={() => onDelete(item.id)} title="Löschen (Entf)" data-testid="delete-furniture">
          Löschen
        </Button>
      </div>
    </SidebarSection>
  );
}
