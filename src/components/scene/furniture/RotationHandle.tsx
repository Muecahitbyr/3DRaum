import { Html } from '@react-three/drei';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { FURNITURE_DRAG_CONFIG } from '../../../config/furniture';
import type { FurnitureItem } from '../../../types/furniture';
import { useFurnitureInteraction } from '../interaction/FurnitureInteractionProvider';
import styles from './RotationHandle.module.css';

/**
 * Rotations-Handle im Grundriss: kleiner Griff hinter der Rückseite des
 * ausgewählten Möbels. Als DOM-Overlay bleibt er bei jedem Zoom gleich groß.
 * Er sitzt im lokalen Möbel-System an der Rückseite (−z); der Versatz nach außen
 * wird im Bildschirm gedreht (Grundriss: Norden oben, Drehung im Uhrzeigersinn).
 */
export function RotationHandle({ item }: { item: FurnitureItem }) {
  const interaction = useFurnitureInteraction();
  if (!interaction) return null;

  const offset = FURNITURE_DRAG_CONFIG.rotationHandleOffsetPx;
  const rotating = interaction.active?.kind === 'rotate' && interaction.active.id === item.id;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Eigener React-Root im Canvas-Container: hier gestoppt, erreicht das Ereignis
    // weder die Kamerasteuerung (Pan) noch die R3F-Objekte (Verschieben).
    event.stopPropagation();
    event.preventDefault();
    interaction.startRotate(item, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  return (
    <Html position={[0, 0.03, -item.depth / 2]} zIndexRange={[15, 0]} pointerEvents="none">
      <div className={`${styles.anchor} ${rotating ? styles.active : ''}`} style={{ transform: `rotate(${item.rotationDeg}deg)` }}>
        <div className={styles.stem} style={{ top: -offset, height: offset - 8 }} />
        <div
          className={styles.knob}
          style={{ top: -offset }}
          onPointerDown={handlePointerDown}
          data-testid="rotation-handle"
          role="slider"
          aria-label="Möbel drehen"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={item.rotationDeg}
          title="Ziehen zum Drehen"
        />
        {rotating && (
          <div className={styles.angle} style={{ top: -offset - 14, transform: `translate(-50%, -100%) rotate(${-item.rotationDeg}deg)` }} data-testid="rotation-angle">
            {item.rotationDeg}°
          </div>
        )}
      </div>
    </Html>
  );
}
