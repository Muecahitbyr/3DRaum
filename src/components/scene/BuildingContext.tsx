import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape, Vector2 } from 'three';
import { BUILDING_CONFIG } from '../../config/building';
import type { RoomModel } from '../../utils/room/model';
import type { CollisionSeverity } from '../../collision';
import { SCENE_COLORS } from '../../config/scene';
import type { ContextRoom } from '../../hooks/useBuildingView';
import { FurnitureLayer } from './furniture/FurnitureLayer';
import { CLICK_DRAG_TOLERANCE_PX } from './room/openings/OpeningElement';
import { Room } from './room/Room';

const NO_SEVERITY: ReadonlyMap<string, CollisionSeverity> = new Map();
const NO_IDS: readonly string[] = [];

interface BuildingContextProps {
  rooms: readonly ContextRoom[];
  isPlan: boolean;
  preview: boolean;
  showCeiling: boolean;
  /** Klick auf ein Nachbarzimmer: dieses Zimmer bearbeiten. */
  onActivate: (id: string) => void;
}

/**
 * Nachbarzimmer der aktiven Etage und – in 3D – die Etage darunter. Sie werden vollständig
 * dargestellt (Wände, Türen, Möbel), sind aber nicht bearbeitbar: Ein Klick darauf wechselt in
 * das Zimmer. Im Grundriss erscheint die Etage darunter nur als gestrichelter Umriss.
 * Steht in der Szene nach dem aktiven Zimmer, damit Objektnamen zuerst dieses finden.
 */
export function BuildingContext({ rooms, isPlan, preview, showCeiling, onActivate }: BuildingContextProps) {
  if (rooms.length === 0) return null;
  return (
    <group name="building-context">
      {rooms.map((room) =>
        room.sameFloor ? (
          <ContextRoomView key={room.id} room={room} isPlan={isPlan} preview={preview} showCeiling={showCeiling} onActivate={onActivate} />
        ) : isPlan ? (
          <LowerFloorOutline key={room.id} room={room} />
        ) : (
          <ContextRoomView key={room.id} room={room} isPlan={false} preview={preview} showCeiling={false} onActivate={onActivate} />
        ),
      )}
    </group>
  );
}

const ContextRoomView = memo(function ContextRoomView({
  room,
  isPlan,
  preview,
  showCeiling,
  onActivate,
}: {
  room: ContextRoom;
  isPlan: boolean;
  preview: boolean;
  showCeiling: boolean;
  onActivate: (id: string) => void;
}) {
  const { id, doc } = room;
  const activate = useCallback(() => onActivate(id), [onActivate, id]);
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta <= CLICK_DRAG_TOLERANCE_PX) activate();
  };
  return (
    <group name={`context-room-${id}`} position-y={room.yOffset} userData={{ roomId: id, roomName: room.name }} onClick={handleClick}>
      <Room
        name={`context-room-${id}-shell`}
        room={room.room}
        design={doc.design}
        openings={doc.openings}
        selectedOpeningId={null}
        fixtures={doc.fixtures}
        severityById={NO_SEVERITY}
        onSelectOpening={activate}
        onSelectFixture={activate}
        preview={preview}
        showCeiling={showCeiling}
        variant={isPlan ? 'plan' : 'model'}
        shares={room.shares}
      />
      {!isPlan && room.elevation > 0 && <FloorSlab room={room.room} />}
      <FurnitureLayer
        furniture={doc.furniture}
        groups={doc.groups}
        room={room.room}
        variant={isPlan ? 'plan' : 'model'}
        selectedIds={NO_IDS}
        severityById={NO_SEVERITY}
        onPick={activate}
      />
    </group>
  );
});

/** Grundriss: Umriss eines Zimmers der Etage darunter (Orientierung beim Planen darüber). */
function LowerFloorOutline({ room }: { room: ContextRoom }) {
  // Knapp über dem Boden des aktiven Zimmers (unter Teppichen und Möbelsymbolen).
  const points = [...room.room.outerPolygon, room.room.outerPolygon[0]].map((p) => [p.x, 0.006, p.z] as [number, number, number]);
  return (
    <Line
      name={`lower-floor-${room.id}`}
      points={points}
      color={SCENE_COLORS.planRugLine}
      lineWidth={1}
      dashed
      dashSize={0.15}
      gapSize={0.1}
    />
  );
}

/**
 * Geschossdecke unter einem Zimmer einer oberen Etage (3D): Außenumriss inkl. Wände,
 * Deckenstärke nach unten. So schwebt die obere Etage nicht über der darunter.
 */
export function FloorSlab({ room }: { room: RoomModel }) {
  const geometry = useMemo(() => {
    // Umriss in x/(−z); um −90° um x gedreht zeigt die Extrusion nach oben – danach unter den Boden geschoben.
    const shape = new Shape(room.outerPolygon.map((p) => new Vector2(p.x, -p.z)));
    const extruded = new ExtrudeGeometry(shape, { depth: BUILDING_CONFIG.slabThickness, bevelEnabled: false });
    extruded.rotateX(-Math.PI / 2);
    extruded.translate(0, -BUILDING_CONFIG.slabThickness - 0.002, 0);
    return extruded;
  }, [room]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh name="floor-slab" geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial color={SCENE_COLORS.slab} roughness={0.95} />
    </mesh>
  );
}
