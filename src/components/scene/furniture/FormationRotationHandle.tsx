import { Html } from '@react-three/drei';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FURNITURE_DRAG_CONFIG } from '../../../config/furniture';
import type { FurnitureItem } from '../../../types/furniture';
import { furnitureToWorld } from '../../../utils/furniture';
import { formationBounds } from '../../../utils/furnitureFormation';
import type { RoomModel } from '../../../utils/room/model';
import { useFurnitureInteraction } from '../interaction/FurnitureInteractionProvider';
import styles from './RotationHandle.module.css';
import { RotationRing } from './RotationRing';

/** Abstand Auswahlrahmen ↔ Griff (wie `SelectionBounds`). */
const PADDING = 0.05;

interface FormationRotationHandleProps {
  /** Ausgewählte Möbel (Mehrfachauswahl oder Gruppe, mindestens zwei). */
  items: readonly FurnitureItem[];
  room: RoomModel;
  variant: 'plan' | 'model';
}

/**
 * Gemeinsamer Drehgriff einer Mehrfachauswahl bzw. Gruppe: im Grundriss über der Mitte der
 * Oberkante des Auswahlrahmens, in „3D Bearbeiten“ als Ring um die Auswahl. Gedreht wird um
 * die Mitte der Auswahl – jedes Möbel kreist mit und dreht sich selbst (ein Verlaufsschritt).
 */
export function FormationRotationHandle({ items, room, variant }: FormationRotationHandleProps) {
  const interaction = useFurnitureInteraction();
  if (!interaction || items.length < 2) return null;
  const ids = items.map((item) => item.id);
  const b = formationBounds(items);
  const center = furnitureToWorld({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }, room);
  const active = interaction.active?.kind === 'rotate-many' ? interaction.active : null;
  const start = (event: ReactPointerEvent<HTMLDivElement>) =>
    interaction.startRotateMany(ids, { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType });

  if (variant === 'model') {
    return (
      <group position={[center.x, 0, center.z]}>
        <RotationRing innerRadius={Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2} rotating={!!active} angle={active?.delta ?? 0} onStart={start} testId="formation-rotation-handle" />
      </group>
    );
  }

  const offset = FURNITURE_DRAG_CONFIG.rotationHandleOffsetPx;
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    start(event);
  };
  return (
    <Html position={[center.x, 0.04, b.z0 - PADDING - room.origin.z]} zIndexRange={[15, 0]} pointerEvents="none">
      <div className={`${styles.anchor} ${active ? styles.active : ''}`}>
        <div className={styles.stem} style={{ top: -offset, height: offset - 8 }} />
        <div
          className={styles.knob}
          style={{ top: -offset }}
          onPointerDown={handlePointerDown}
          data-testid="formation-rotation-handle"
          role="slider"
          aria-label="Auswahl drehen"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(active?.delta ?? 0)}
          title="Ziehen zum Drehen der Auswahl"
        />
        {active && (
          <div className={styles.angle} style={{ top: -offset - 14 }} data-testid="rotation-angle">
            {Math.round(active.delta)}°
          </div>
        )}
      </div>
    </Html>
  );
}
