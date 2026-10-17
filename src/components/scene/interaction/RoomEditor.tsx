import { Html, Line } from '@react-three/drei';
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ROOM_EDITOR_CONFIG } from '../../../config/room';
import { SCENE_COLORS } from '../../../config/scene';
import type { FloorPoint } from '../../../types/room';
import { BUILDING_CONFIG } from '../../../config/building';
import { roomPositionOf } from '../../../utils/building/building';
import { snapRoomMove } from '../../../utils/building/placement';
import { boundsOf } from '../../../utils/polygon';
import { toPlan, toWorld, type RoomModel } from '../../../utils/room/model';
import { snapCorner, type CornerSnapGuide } from '../../../utils/room/snap';
import styles from './RoomEditor.module.css';
import { usePlanPointerSession } from './usePlanPointerSession';

const HANDLE_STYLE = { pointerEvents: 'none' } as const;

interface RoomEditorProps {
  room: RoomModel;
  selectedCornerId: string | null;
  onSelectCorner: (wallId: string) => void;
  /** Ecke verschieben (Grundrisskoordinaten); ungültige Grundrisse lehnt der Reducer ab. */
  onMoveCorner: (wallId: string, point: FloorPoint) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  /** Andere Zimmer der Etage (bzw. darunter): Dann lässt sich das Zimmer im Gebäude verschieben. */
  neighbors?: readonly RoomModel[] | null;
  /** Neue Lage des Zimmers (linke/obere Innenecke, Welt). */
  onMoveRoom?: (position: FloorPoint) => void;
}

/**
 * Grundriss-Editor (nur 2D): Eckgriffe als DOM-Overlay (zoomunabhängig groß).
 * Ziehen verschiebt die Ecke live, mit Einrasten (fluchten, 45°/90°) und
 * Esc zum Abbrechen. Eine komplette Ziehbewegung ist ein Verlaufsschritt.
 */
export function RoomEditor({ room, selectedCornerId, onSelectCorner, onMoveCorner, onGestureStart, onGestureEnd, neighbors = null, onMoveRoom }: RoomEditorProps) {
  const { begin, pointerToFloor } = usePlanPointerSession();
  const latest = useRef({ room, onMoveCorner, onGestureStart, onGestureEnd, neighbors, onMoveRoom });
  useLayoutEffect(() => {
    latest.current = { room, onMoveCorner, onGestureStart, onGestureEnd, neighbors, onMoveRoom };
  });
  const [roomGuides, setRoomGuides] = useState<{ from: FloorPoint; to: FloorPoint }[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ items: CornerSnapGuide[]; origin: FloorPoint } | null>(null);
  const y = room.dimensions.height + 0.08;

  const startDrag = (wallId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Eigener React-Root im Canvas-Container: hier gestoppt, erreicht das Ereignis weder Kamera noch Szene.
    event.stopPropagation();
    event.preventDefault();
    onSelectCorner(wallId);
    const wall = latest.current.room.wallById.get(wallId);
    if (!wall) return;
    const original = wall.planStart;
    // Greifversatz: Die Ecke springt nicht zum Zeiger.
    const down = pointerToFloor(event.clientX, event.clientY);
    const downPlan = down ? toPlan(down, latest.current.room.origin) : original;
    const grab = { x: downPlan.x - original.x, z: downPlan.z - original.z };
    const originalWorld = toWorld(original, latest.current.room.origin);
    setDragging(wallId);
    begin(
      {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startTolerancePx: ROOM_EDITOR_CONFIG.dragStartTolerancePx,
        onMove: (floor, metersPerPixel) => {
          const current = latest.current.room;
          const pointer = toPlan(floor, current.origin);
          const desired = { x: pointer.x - grab.x, z: pointer.z - grab.z };
          const snapped = snapCorner(current, wallId, desired, metersPerPixel);
          latest.current.onMoveCorner(wallId, snapped.point);
          setGuides(snapped.guides.length ? { items: snapped.guides, origin: current.origin } : null);
        },
        // Weltlage merken: Die Normalisierung kann das Grundrisssystem während des Ziehens verschieben.
        onCancel: () => latest.current.onMoveCorner(wallId, toPlan(originalWorld, latest.current.room.origin)),
        onEnd: () => {
          setDragging(null);
          setGuides(null);
          latest.current.onGestureEnd?.();
        },
      },
      'grabbing',
    );
    latest.current.onGestureStart?.();
  };

  /** Ganzes Zimmer im Gebäude verschieben: rastet an Außenflächen der Nachbarn ein (gemeinsame Wand). */
  const startRoomMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const start = latest.current.room;
    const down = pointerToFloor(event.clientX, event.clientY);
    if (!down) return;
    const original = roomPositionOf(start.plan);
    setDragging('room');
    begin(
      {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        startTolerancePx: ROOM_EDITOR_CONFIG.dragStartTolerancePx,
        onMove: (floor, metersPerPixel) => {
          const raw = { x: floor.x - down.x, z: floor.z - down.z };
          const snapped = snapRoomMove(start, raw, latest.current.neighbors ?? [], BUILDING_CONFIG.snapDistancePx * metersPerPixel);
          latest.current.onMoveRoom?.({ x: original.x + snapped.delta.x, z: original.z + snapped.delta.z });
          setRoomGuides(snapped.guides.length ? snapped.guides : null);
        },
        onCancel: () => latest.current.onMoveRoom?.(original),
        onEnd: () => {
          setDragging(null);
          setRoomGuides(null);
          latest.current.onGestureEnd?.();
        },
      },
      'grabbing',
    );
    latest.current.onGestureStart?.();
  };
  const inner = boundsOf(room.worldPolygon);
  const canMoveRoom = !!neighbors && neighbors.length > 0 && !!onMoveRoom;

  return (
    <group name="room-editor">
      {canMoveRoom && (
        <Html position={[(inner.minX + inner.maxX) / 2, y, (inner.minZ + inner.maxZ) / 2]} zIndexRange={[16, 0]} style={HANDLE_STYLE}>
          <div
            className={`${styles.move} ${dragging === 'room' ? styles.dragging : ''}`}
            onPointerDown={startRoomMove}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            data-testid="room-move-handle"
            role="button"
            aria-label="Zimmer verschieben"
            title="Zimmer verschieben (rastet an Nachbarwänden ein)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2" />
            </svg>
          </div>
        </Html>
      )}
      {roomGuides?.map((g, i) => (
        <Line
          key={`room-guide-${i}`}
          name="room-move-guide"
          points={[
            [g.from.x, y, g.from.z],
            [g.to.x, y, g.to.z],
          ]}
          color={SCENE_COLORS.selection}
          lineWidth={2}
          dashed
          dashSize={0.12}
          gapSize={0.08}
        />
      ))}
      {room.walls.map((wall) => {
        const p = wall.start;
        const selected = wall.id === selectedCornerId;
        return (
          <Html key={wall.id} position={[p.x, y, p.z]} zIndexRange={[16, 0]} style={HANDLE_STYLE}>
            <div
              className={`${styles.corner} ${selected ? styles.selected : ''} ${dragging === wall.id ? styles.dragging : ''}`}
              onPointerDown={(event) => startDrag(wall.id, event)}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              data-testid="room-corner"
              data-wall-id={wall.id}
              data-selected={selected}
              role="button"
              aria-label={`Ecke ${wall.index + 1} verschieben`}
              title="Ecke ziehen (Einrasten: fluchten, 45°/90°)"
            />
          </Html>
        );
      })}
      {guides?.items.map((g, i) => {
        const a = toWorld(g.from, guides.origin);
        const b = toWorld(g.to, guides.origin);
        return (
          <Line
            key={i}
            name={`room-snap-guide-${g.axis}`}
            points={[
              [a.x, y, a.z],
              [b.x, y, b.z],
            ]}
            color={SCENE_COLORS.selection}
            lineWidth={1.25}
            dashed
            dashSize={0.08}
            gapSize={0.06}
          />
        );
      })}
    </group>
  );
}
