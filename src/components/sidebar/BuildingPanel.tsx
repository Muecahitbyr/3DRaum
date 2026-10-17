import { BUILDING_CONFIG } from '../../config/building';
import type { BuildingView } from '../../hooks/useBuildingView';
import type { FloorPoint } from '../../types/room';
import { roomPositionOf } from '../../utils/building/building';
import type { RoomModel } from '../../utils/room/model';
import { formatMeters } from '../../utils/units';
import { Button } from '../ui/Button';
import { MeasurementInput } from '../ui/MeasurementInput';
import { SelectField } from '../ui/SelectField';
import { TextField } from '../ui/TextField';
import styles from './BuildingPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface BuildingPanelProps {
  view: BuildingView;
  room: RoomModel;
  onAddRoom: () => void;
  onRemoveRoom: (id: string) => void;
  onRenameRoom: (id: string, name: string) => void;
  onSwitchRoom: (id: string) => void;
  onMoveRoom: (position: FloorPoint) => void;
  onAddFloor: () => void;
  onRemoveFloor: (id: string) => void;
  onRenameFloor: (id: string, name: string) => void;
  onSwitchFloor: (id: string) => void;
}

/** Größte Lage-Koordinate eines Zimmers (Welt, Meter). */
const POSITION_LIMIT = 200;

const displayName = (name: string) => name.trim() || 'Ohne Namen';

/**
 * Bereich „Etagen & Zimmer“: Etage wählen, Zimmer der Etage wählen, hinzufügen, umbenennen,
 * verschieben und löschen. Neue Zimmer liegen Wand an Wand neben dem aktiven Zimmer
 * (gemeinsame Wand), neue Etagen darüber.
 */
export function BuildingPanel({
  view,
  room,
  onAddRoom,
  onRemoveRoom,
  onRenameRoom,
  onSwitchRoom,
  onMoveRoom,
  onAddFloor,
  onRemoveFloor,
  onRenameFloor,
  onSwitchFloor,
}: BuildingPanelProps) {
  const { building, floors, activeFloorId, activeRoomId, multi } = view;
  const floor = floors.find((f) => f.id === activeFloorId) ?? floors[0];
  const activeName = building.rooms.find((r) => r.id === activeRoomId)?.name ?? '';
  const floorName = building.floors.find((f) => f.id === activeFloorId)?.name ?? '';
  const position = roomPositionOf(room.plan);
  const roomFull = building.rooms.length >= BUILDING_CONFIG.maxRooms;
  const overlapNames = view.overlapping.map((id) => displayName(building.rooms.find((r) => r.id === id)?.name ?? ''));

  return (
    <SidebarSection title="Etagen & Zimmer" testId="building-panel">
      {building.floors.length > 1 && (
        <div data-testid="floor-select">
          <SelectField
            label="Etage"
            value={activeFloorId}
            options={floors.map((f) => ({ value: f.id, label: `${displayName(f.name)} · ${f.rooms.length} Zimmer` }))}
            onChange={onSwitchFloor}
          />
        </div>
      )}
      {multi && (
        <ul className={styles.list} aria-label={`Zimmer: ${displayName(floor.name)}`}>
          {floor.rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={r.id === activeRoomId}
                onClick={() => onSwitchRoom(r.id)}
                data-testid="room-list-item"
                data-room-id={r.id}
              >
                <span className={styles.itemName}>{displayName(r.name)}</span>
                <span className={styles.itemMeta}>{formatMeters(r.area)} m²</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button onClick={onAddRoom} disabled={roomFull} data-testid="add-room" title="Zimmer hinzufügen – Wand an Wand neben dem aktuellen">
          Neues Zimmer
        </Button>
        <Button
          onClick={onAddFloor}
          disabled={roomFull || building.floors.length >= BUILDING_CONFIG.maxFloors}
          data-testid="add-floor"
          title="Etage hinzufügen – oben, mit einem Zimmer im gleichen Umriss"
        >
          Neue Etage
        </Button>
      </div>
      {!multi && <p className={styles.hint}>Neue Zimmer entstehen Wand an Wand (gemeinsame Wand), neue Etagen darüber.</p>}
      {multi && (
        <>
          <div className={styles.row}>
            <TextField label="Zimmername" value={activeName} maxLength={BUILDING_CONFIG.nameMaxLength} onChange={(name) => onRenameRoom(activeRoomId, name)} />
            <TextField label="Etagenname" value={floorName} maxLength={BUILDING_CONFIG.nameMaxLength} onChange={(name) => onRenameFloor(activeFloorId, name)} />
          </div>
          <div className={styles.row} data-testid="room-position">
            <MeasurementInput
              key={`x-${position.x}`}
              label="Lage links"
              value={position.x}
              min={-POSITION_LIMIT}
              max={POSITION_LIMIT}
              step={0.05}
              onChange={(x) => onMoveRoom({ x, z: position.z })}
            />
            <MeasurementInput
              key={`z-${position.z}`}
              label="Lage oben"
              value={position.z}
              min={-POSITION_LIMIT}
              max={POSITION_LIMIT}
              step={0.05}
              onChange={(z) => onMoveRoom({ x: position.x, z })}
            />
          </div>
          <p className={styles.hint}>Lage der linken oberen Innenecke. Im Grundriss-Editor lässt sich das Zimmer ziehen; es rastet an Nachbarwänden ein.</p>
          {overlapNames.length > 0 && (
            <p className={styles.warning} role="status" data-testid="room-overlap">
              Überschneidet sich mit {overlapNames.join(', ')}.
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="danger" onClick={() => onRemoveRoom(activeRoomId)} disabled={building.rooms.length <= 1} data-testid="remove-room">
              Zimmer löschen
            </Button>
            <Button variant="danger" onClick={() => onRemoveFloor(activeFloorId)} disabled={building.floors.length <= 1} data-testid="remove-floor">
              Etage löschen
            </Button>
          </div>
        </>
      )}
    </SidebarSection>
  );
}
