import { ROOM_DIMENSION_CONSTRAINTS, ROOM_DIMENSION_KEYS, ROOM_LIMITS, ROOM_SHAPE_LABELS } from '../../config/room';
import type { Meters, RoomDimensionKey, RoomShape } from '../../types/room';
import type { RoomModel } from '../../utils/room/model';
import { formatMeters } from '../../utils/units';
import { Button } from '../ui/Button';
import { ChoiceField } from '../ui/ChoiceField';
import { MeasurementInput } from '../ui/MeasurementInput';
import styles from './RoomPanel.module.css';
import { SidebarSection } from './SidebarSection';

const SHAPE_OPTIONS = (Object.keys(ROOM_SHAPE_LABELS) as RoomShape[]).map((value) => ({
  value,
  label: value === 'free' ? 'Frei' : ROOM_SHAPE_LABELS[value],
}));

interface RoomPanelProps {
  room: RoomModel;
  editing: boolean;
  selectedWallId: string | null;
  selectedCornerId: string | null;
  onDimensionChange: (key: RoomDimensionKey, value: Meters) => void;
  onShapeChange: (shape: RoomShape) => void;
  onToggleEditing: () => void;
  onWallLengthChange: (wallId: string, length: Meters) => void;
  onWallThicknessChange: (wallId: string, thickness: Meters) => void;
  onSplitWall: (wallId: string) => void;
  onRemoveWall: (wallId: string) => void;
  onCornerMove: (wallId: string, point: { x: Meters; z: Meters }) => void;
  onRemoveCorner: (wallId: string) => void;
}

/**
 * Bereich „Raum“: Raumform, Maße (Rechteck: Breite/Länge wie bisher), Grundriss-Editor
 * und Eigenschaften der ausgewählten Wand bzw. Ecke.
 */
export function RoomPanel({
  room,
  editing,
  selectedWallId,
  selectedCornerId,
  onDimensionChange,
  onShapeChange,
  onToggleEditing,
  onWallLengthChange,
  onWallThicknessChange,
  onSplitWall,
  onRemoveWall,
  onCornerMove,
  onRemoveCorner,
}: RoomPanelProps) {
  const rectangle = room.plan.shape === 'rectangle' && room.isRectangle;
  const keys = rectangle ? ROOM_DIMENSION_KEYS : (['height'] as const);
  const wall = selectedWallId ? room.wallById.get(selectedWallId) : undefined;
  const corner = selectedCornerId ? room.wallById.get(selectedCornerId) : undefined;
  const canRemove = room.walls.length > ROOM_LIMITS.minWalls;

  return (
    <SidebarSection title="Raummaße" testId="room-panel">
      {keys.map((key) => {
        const { label, min, max, step } = ROOM_DIMENSION_CONSTRAINTS[key];
        return (
          <MeasurementInput
            key={key}
            label={key === 'height' ? 'Höhe' : label}
            value={room.dimensions[key]}
            min={min}
            max={max}
            step={step}
            onChange={(value) => onDimensionChange(key, value)}
          />
        );
      })}
      {!rectangle && (
        <p className={styles.info} data-testid="room-summary">
          {room.walls.length} Wände · Umriss {formatMeters(room.dimensions.width)} × {formatMeters(room.dimensions.length)} m
        </p>
      )}

      <ChoiceField<RoomShape>
        label="Raumform"
        options={SHAPE_OPTIONS}
        value={room.plan.shape}
        onChange={onShapeChange}
        testId="room-shape"
      />
      <p className={styles.hint}>Neue Form ersetzt den Grundriss (rückgängig machbar).</p>

      <Button block variant={editing ? 'primary' : 'default'} onClick={onToggleEditing} aria-pressed={editing} data-testid="room-edit-toggle">
        {editing ? 'Grundriss-Bearbeitung beenden' : 'Grundriss bearbeiten'}
      </Button>

      {editing && !wall && !corner && (
        <p className={styles.hint} data-testid="room-edit-hint">
          Ecken ziehen (rastet waagerecht/senkrecht, an anderen Ecken und bei 45°/90° ein) oder eine Wand anklicken.
        </p>
      )}

      {editing && wall && (
        <div className={styles.group} data-testid="wall-properties">
          <div className={styles.title}>{wall.label}</div>
          <div className={styles.row}>
            <MeasurementInput
              key={`${wall.id}-length`}
              label="Länge"
              value={wall.length}
              min={ROOM_LIMITS.minWallLength}
              max={ROOM_LIMITS.maxWallLength}
              step={0.05}
              onChange={(value) => onWallLengthChange(wall.id, value)}
            />
            <MeasurementInput
              key={`${wall.id}-thickness`}
              label="Wandstärke"
              value={wall.thickness}
              min={ROOM_LIMITS.thickness.min}
              max={ROOM_LIMITS.thickness.max}
              step={0.01}
              onChange={(value) => onWallThicknessChange(wall.id, value)}
            />
          </div>
          <p className={styles.hint}>Länge: Wandende wird verschoben, die folgende Wand wandert parallel mit.</p>
          <div className={styles.actions}>
            <Button onClick={() => onSplitWall(wall.id)} data-testid="wall-split">
              Ecke einfügen
            </Button>
            <Button variant="danger" onClick={() => onRemoveWall(wall.id)} disabled={!canRemove} data-testid="wall-remove">
              Wand entfernen
            </Button>
          </div>
        </div>
      )}

      {editing && corner && (
        <div className={styles.group} data-testid="corner-properties">
          <div className={styles.title}>Ecke {corner.index + 1}</div>
          <div className={styles.row}>
            <MeasurementInput
              key={`${corner.id}-x-${corner.planStart.x}`}
              label="X"
              value={corner.planStart.x}
              min={-ROOM_LIMITS.maxExtent}
              max={ROOM_LIMITS.maxExtent}
              step={0.05}
              onChange={(x) => onCornerMove(corner.id, { x, z: corner.planStart.z })}
            />
            <MeasurementInput
              key={`${corner.id}-z-${corner.planStart.z}`}
              label="Z"
              value={corner.planStart.z}
              min={-ROOM_LIMITS.maxExtent}
              max={ROOM_LIMITS.maxExtent}
              step={0.05}
              onChange={(z) => onCornerMove(corner.id, { x: corner.planStart.x, z })}
            />
          </div>
          <p className={styles.hint}>Gemessen ab linker (X) bzw. oberer (Z) Kante des Grundrisses.</p>
          <Button variant="danger" block onClick={() => onRemoveCorner(corner.id)} disabled={!canRemove} data-testid="corner-remove">
            Ecke entfernen
          </Button>
        </div>
      )}
    </SidebarSection>
  );
}
