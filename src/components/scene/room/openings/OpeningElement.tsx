import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { DoubleSide } from 'three';
import { PLAN_SYMBOL_CONFIG } from '../../../../config/scene';
import type { CollisionSeverity } from '../../../../collision';
import type { Opening } from '../../../../types/opening';
import type { WallSegment } from '../../../../types/room';
import type { OpeningLocalSpan } from '../../../../utils/openings';
import { useOpeningDrag } from '../../interaction/OpeningDragProvider';
import type { RoomVariant } from '../Room';
import { DoorModel } from './DoorModel';
import { DoorPlanSymbol } from './DoorPlanSymbol';
import { WindowModel } from './WindowModel';
import { WindowPlanSymbol } from './WindowPlanSymbol';

/** Pixel, ab denen ein Klick als Ziehen (Kamera) gilt und nicht auswählt. */
export const CLICK_DRAG_TOLERANCE_PX = 4;

export interface OpeningPartProps {
  span: OpeningLocalSpan;
  wall: WallSegment;
  selected: boolean;
  /** Kollisionsstatus aus dem zentralen Bericht (nur im Grundriss hervorgehoben). */
  status: CollisionSeverity | null;
}

interface OpeningElementProps extends OpeningPartProps {
  opening: Opening;
  variant: RoomVariant;
  /** `false`, solange die zugehörige Wand in 3D ausgeblendet ist – dann keine Klicks/Hover. */
  interactive?: boolean;
  onSelect: (id: string) => void;
}

/**
 * Tür oder Fenster im lokalen Wand-Koordinatensystem. Kümmert sich um Auswahl und
 * Hover; die eigentliche Darstellung übernehmen die Modell- bzw. Grundriss-Komponenten.
 */
export function OpeningElement({ opening, variant, onSelect, interactive = true, ...partProps }: OpeningElementProps) {
  const isPlan = variant === 'plan';
  const drag = useOpeningDrag();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, isPlan && drag ? 'grab' : 'pointer');
  useEffect(() => {
    if (!interactive) setHovered(false);
  }, [interactive]);

  // Grundriss: linke Maustaste greift das Element (Auswahl + Ziehen entlang der Wand).
  // Andere Tasten bleiben der Kamera (Pan) vorbehalten. In 3D gibt es kein Ziehen.
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isPlan || !drag || event.button !== 0) return;
    event.stopPropagation();
    onSelect(opening.id);
    drag.startDrag(opening, event);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > CLICK_DRAG_TOLERANCE_PX) return;
    onSelect(opening.id);
  };

  const { span, wall } = partProps;
  const isDoor = opening.type === 'door';

  return (
    <group
      name={opening.id}
      userData={{
        openingId: opening.id,
        openingType: opening.type,
        ...(opening.type === 'door' ? { hinge: opening.hinge, swing: opening.swing } : { sashes: opening.sashes }),
      }}
      onClick={interactive ? handleClick : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              setHovered(true);
            }
          : undefined
      }
      onPointerOut={interactive ? () => setHovered(false) : undefined}
    >
      {isPlan ? (
        opening.type === 'door' ? <DoorPlanSymbol {...partProps} /> : <WindowPlanSymbol {...partProps} sashes={opening.sashes} />
      ) : opening.type === 'door' ? (
        <DoorModel {...partProps} />
      ) : (
        <WindowModel {...partProps} sashes={opening.sashes} />
      )}
      <HitArea span={span} wall={wall} plan={isPlan} door={isDoor} raised={partProps.selected} />
    </group>
  );
}

/** Unsichtbare Klickfläche über der gesamten Öffnung (auch durch die leere Öffnung hindurch). */
function HitArea({
  span,
  wall,
  plan,
  door,
  raised,
}: {
  span: OpeningLocalSpan;
  wall: WallSegment;
  plan: boolean;
  door: boolean;
  /** Ausgewähltes Element liegt minimal höher und gewinnt bei Überlappung das Greifen. */
  raised: boolean;
}) {
  const width = span.x1 - span.x0;
  const centerX = (span.x0 + span.x1) / 2;

  if (plan) {
    // Grundriss: Öffnung in der Wand plus – bei Türen – Schwenkbereich des Türblatts
    // (innen oder außen, je nach Öffnungsrichtung).
    const swing = door ? width : 0;
    const z0 = -wall.thickness / 2 - (span.swingSign < 0 ? swing : 0);
    const z1 = wall.thickness / 2 + (span.swingSign > 0 ? swing : 0);
    return (
      <mesh
        position={[
          centerX,
          wall.height + PLAN_SYMBOL_CONFIG.hitElevation + (raised ? PLAN_SYMBOL_CONFIG.selectedHitLift : 0),
          (z0 + z1) / 2,
        ]}
        rotation-x={-Math.PI / 2}
      >
        <planeGeometry args={[width, z1 - z0]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={DoubleSide} />
      </mesh>
    );
  }

  return (
    <mesh position={[centerX, (span.y0 + span.y1) / 2, 0]}>
      <planeGeometry args={[width, span.y1 - span.y0]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={DoubleSide} />
    </mesh>
  );
}
