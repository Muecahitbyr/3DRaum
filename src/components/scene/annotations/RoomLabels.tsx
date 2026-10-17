import { Html } from '@react-three/drei';
import { PLAN_SYMBOL_CONFIG } from '../../../config/scene';
import { roomMeasurements } from '../../../utils/room/measurements';
import type { RoomModel } from '../../../utils/room/model';
import { formatMeters } from '../../../utils/units';
import styles from './RoomLabels.module.css';

interface RoomLabelsProps {
  rooms: readonly { id: string; name: string; room: RoomModel; active: boolean }[];
}

/** Abstand des Etiketts von der Innenecke (Pixel). */
const INSET_PX = 8;
const PASS_THROUGH = { pointerEvents: 'none' } as const;

/**
 * Grundriss mit mehreren Zimmern: Name und Grundfläche je Zimmer, oben links in der Innenecke
 * (dort verdeckt das Etikett selten Möbel). Das bearbeitete Zimmer ist hervorgehoben.
 * Die Etiketten nehmen keine Zeigerereignisse an – Klicks gehen an Möbel bzw. das Zimmer.
 */
export function RoomLabels({ rooms }: RoomLabelsProps) {
  return (
    <group name="room-labels">
      {rooms.map(({ id, name, room, active }) => {
        // Ecke oben links (kleinste Summe x + z) des Innenumrisses.
        const corner = room.worldPolygon.reduce((best, p) => (p.x + p.z < best.x + best.z ? p : best), room.worldPolygon[0]);
        const y = room.dimensions.height + PLAN_SYMBOL_CONFIG.lineElevation + 0.03;
        return (
          <Html key={id} position={[corner.x, y, corner.z]} zIndexRange={[12, 0]} style={PASS_THROUGH}>
            <div style={{ marginLeft: INSET_PX, marginTop: INSET_PX }} className={`${styles.label} ${active ? styles.active : ''}`} data-testid="room-label" data-room-id={id} data-active={active}>
              <span className={styles.name}>{name.trim() || 'Ohne Namen'}</span>
              <span className={styles.area}>{formatMeters(roomMeasurements(room).area)} m²</span>
            </div>
          </Html>
        );
      })}
    </group>
  );
}
