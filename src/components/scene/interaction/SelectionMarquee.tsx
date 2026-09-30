import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState } from 'react';
import { DoubleSide } from 'three';
import { polygonsOverlap, rectanglePolygon } from '../../../collision/geometry';
import { SCENE_COLORS } from '../../../config/scene';
import type { FurnitureItem } from '../../../types/furniture';
import type { FloorPoint } from '../../../types/room';
import type { RoomModel } from '../../../utils/room/model';
import { furnitureToWorld } from '../../../utils/furniture';
import { usePlanPointerSession } from './usePlanPointerSession';

/** Knapp über dem Boden, unter allen Symbolen – erhält nur Klicks ins Leere. */
const CATCHER_Y = 0.001;
const CATCHER_SIZE = 400;
const RECT_Y = 0.05;
/** Wie der Klick ins Leere bei R3F: bis 2 px Bewegung zählt als Klick. */
const CLICK_TOLERANCE_PX = 2;

interface SelectionMarqueeProps {
  room: RoomModel;
  furniture: readonly FurnitureItem[];
  selectedIds: readonly string[];
  /** Auswahl setzen (inkl. Gruppen). */
  onSelectMany: (ids: string[]) => void;
  /** Klick ins Leere: Auswahl aufheben. */
  onClear: () => void;
}

/** Möbel, deren (gedrehte) Grundfläche das Rechteck schneidet. */
export function furnitureInRect(furniture: readonly FurnitureItem[], a: FloorPoint, b: FloorPoint, room: RoomModel): string[] {
  const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const rect = rectanglePolygon(center, Math.abs(a.x - b.x) / 2, Math.abs(a.z - b.z) / 2, 0);
  return furniture
    .filter((item) => polygonsOverlap(rectanglePolygon(furnitureToWorld(item.position, room), item.width / 2, item.depth / 2, item.rotationDeg), rect, 0))
    .map((item) => item.id);
}

/**
 * Grundriss: Shift + Ziehen auf einer freien Fläche zieht einen Auswahlrahmen auf;
 * alle berührten Möbel werden der Auswahl hinzugefügt. Ohne Shift bleibt Ziehen
 * der Kamera (Verschieben der Ansicht) vorbehalten; ein Klick ins Leere hebt die Auswahl auf.
 */
export function SelectionMarquee({ room, furniture, selectedIds, onSelectMany, onClear }: SelectionMarqueeProps) {
  const { begin } = usePlanPointerSession();
  const [rect, setRect] = useState<{ a: FloorPoint; b: FloorPoint } | null>(null);
  const latest = useRef({ room, furniture, selectedIds, onSelectMany });
  useLayoutEffect(() => {
    latest.current = { room, furniture, selectedIds, onSelectMany };
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !event.shiftKey) return;
    event.stopPropagation();
    const start = { x: event.point.x, z: event.point.z };
    let current: FloorPoint = start;
    begin(
      {
        pointerId: event.pointerId,
        clientX: event.nativeEvent.clientX,
        clientY: event.nativeEvent.clientY,
        startTolerancePx: 3,
        onMove: (floor) => {
          current = floor;
          setRect({ a: start, b: floor });
        },
        onCancel: () => {
          current = start;
        },
        onEnd: () => {
          setRect(null);
          if (current === start) return;
          const { room: d, furniture: all, selectedIds: selected, onSelectMany: select } = latest.current;
          const hits = furnitureInRect(all, start, current, d);
          if (hits.length) select([...selected, ...hits.filter((id) => !selected.includes(id))]);
        },
      },
      'crosshair',
    );
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta <= CLICK_TOLERANCE_PX && !event.shiftKey) onClear();
  };

  return (
    <>
      <mesh name="selection-catcher" position={[0, CATCHER_Y, 0]} rotation-x={-Math.PI / 2} onPointerDown={handlePointerDown} onClick={handleClick}>
        <planeGeometry args={[CATCHER_SIZE, CATCHER_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={DoubleSide} />
      </mesh>
      {rect && (
        <group name="selection-marquee">
          <mesh position={[(rect.a.x + rect.b.x) / 2, RECT_Y - 0.002, (rect.a.z + rect.b.z) / 2]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[Math.max(Math.abs(rect.a.x - rect.b.x), 1e-4), Math.max(Math.abs(rect.a.z - rect.b.z), 1e-4)]} />
            <meshBasicMaterial color={SCENE_COLORS.selection} transparent opacity={0.08} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [rect.a.x, RECT_Y, rect.a.z],
              [rect.b.x, RECT_Y, rect.a.z],
              [rect.b.x, RECT_Y, rect.b.z],
              [rect.a.x, RECT_Y, rect.b.z],
              [rect.a.x, RECT_Y, rect.a.z],
            ]}
            color={SCENE_COLORS.selection}
            lineWidth={1.25}
          />
        </group>
      )}
    </>
  );
}
