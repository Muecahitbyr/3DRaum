import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { FURNITURE_DRAG_CONFIG } from '../../../config/furniture';
import { SCENE_COLORS } from '../../../config/scene';
import type { FurnitureItem, FurniturePatch } from '../../../types/furniture';
import type { FloorPoint } from '../../../types/room';
import type { RoomModel } from '../../../utils/room/model';
import { furnitureToWorld } from '../../../utils/furniture';
import { moveFormation } from '../../../utils/furnitureFormation';
import { computeFurnitureMove, planAngleDeg, snapRotation, type FurnitureSnapGuide } from '../../../utils/furnitureDrag';
import { formationCenter, rotateFormation, type FurnitureTransform } from '../../../utils/furnitureRotation';
import { usePlanPointerSession, type PointerStart } from './usePlanPointerSession';

export interface FurnitureInteractionApi {
  /**
   * Verschieben starten (linke Maustaste bzw. Finger auf dem Möbel – im Grundriss und in
   * „3D Bearbeiten“). `ids`: alle gemeinsam zu verschiebenden Möbel (Mehrfachauswahl/Gruppe);
   * das gegriffene rastet ein.
   */
  startMove: (item: FurnitureItem, event: ThreeEvent<PointerEvent>, ids?: readonly string[]) => void;
  /** Drehen starten (Rotations-Handle). */
  startRotate: (item: FurnitureItem, pointer: PointerStart) => void;
  /** Mehrere Möbel (Auswahl, Gruppe) gemeinsam um ihre Mitte drehen. */
  startRotateMany: (ids: readonly string[], pointer: PointerStart) => void;
  /** Laufende Bearbeitung, z. B. für die Winkelanzeige am Handle (`delta`: Drehwinkel der Auswahl). */
  active: { kind: 'move' | 'rotate'; id: string } | { kind: 'rotate-many'; ids: readonly string[]; delta: number } | null;
}

const FurnitureInteractionContext = createContext<FurnitureInteractionApi | null>(null);

/** `null`, wenn direkte Bearbeitung nicht verfügbar ist (3D-Ansicht). */
export function useFurnitureInteraction(): FurnitureInteractionApi | null {
  return useContext(FurnitureInteractionContext);
}

interface GuideState {
  guides: FurnitureSnapGuide[];
  pixelsPerMeter: number;
}

/** Hilfslinien liegen knapp über den Möbelsymbolen. */
const GUIDE_Y = 0.03;

interface FurnitureInteractionProviderProps {
  enabled: boolean;
  room: RoomModel;
  furniture: readonly FurnitureItem[];
  onUpdate: (id: string, patch: FurniturePatch) => void;
  /** Mehrere Möbel gleichzeitig versetzen (gemeinsames Verschieben). */
  onSetPositions?: (positions: Record<string, FloorPoint>) => void;
  /** Mehrere Möbel gleichzeitig drehen (Position + Drehung). */
  onSetTransforms?: (transforms: Record<string, FurnitureTransform>) => void;
  /** Anfang/Ende einer Zieh- oder Drehbewegung – für den Verlauf (eine Geste = ein Schritt). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  children: ReactNode;
}

/**
 * Verschieben und Drehen von Möbeln im Grundriss und in „3D Bearbeiten“ – dieselbe Logik
 * für beide Ansichten (Bodenebene, Einrasten, Raumkontur). Alle Änderungen laufen über den
 * Reducer – dort werden Maße, Rotation und Raumgrenzen normalisiert, daher zeigt die
 * Sidebar die Werte live an. Eine Geste = ein Verlaufsschritt; Esc stellt den Ausgangszustand her.
 */
export function FurnitureInteractionProvider({
  enabled,
  room,
  furniture,
  onUpdate,
  onSetPositions,
  onSetTransforms,
  onGestureStart,
  onGestureEnd,
  children,
}: FurnitureInteractionProviderProps) {
  const latest = useRef({ room, furniture, onUpdate, onSetPositions, onSetTransforms, onGestureStart, onGestureEnd });
  useLayoutEffect(() => {
    latest.current = { room, furniture, onUpdate, onSetPositions, onSetTransforms, onGestureStart, onGestureEnd };
  });

  const { begin, end, pointerToFloor } = usePlanPointerSession();
  const [active, setActive] = useState<FurnitureInteractionApi['active']>(null);
  const [guideState, setGuideState] = useState<GuideState | null>(null);

  const startMove = useCallback(
    (item: FurnitureItem, event: ThreeEvent<PointerEvent>, ids: readonly string[] = [item.id]) => {
      const { room: dims, furniture: startFurniture, onSetPositions: setPositions } = latest.current;
      // Greifpunkt relativ zum Mittelpunkt, damit das Möbel nicht zum Zeiger springt – gemessen
      // auf der Bodenebene (in 3D trifft der Zeiger sonst z. B. die Tischplatte, nicht den Boden).
      const down = pointerToFloor(event.nativeEvent.clientX, event.nativeEvent.clientY) ?? { x: event.point.x, z: event.point.z };
      const grab = { x: down.x + dims.origin.x - item.position.x, z: down.z + dims.origin.z - item.position.z };
      const original = item.position;
      // Formation: Ausgangslagen aller mitbewegten Möbel (Verschiebung immer relativ dazu).
      const formation = setPositions ? startFurniture.filter((f) => ids.includes(f.id)) : [];
      const multi = formation.length > 1 && formation.some((f) => f.id === item.id);
      const originals = Object.fromEntries(formation.map((f) => [f.id, f.position]));
      setActive({ kind: 'move', id: item.id });
      begin(
        {
          pointerId: event.pointerId,
          clientX: event.nativeEvent.clientX,
          clientY: event.nativeEvent.clientY,
          pointerType: event.nativeEvent.pointerType,
          startTolerancePx: FURNITURE_DRAG_CONFIG.dragStartTolerancePx,
          onMove: (floor, metersPerPixel) => {
            const { room: d, furniture: all, onUpdate: update } = latest.current;
            const current = all.find((f) => f.id === item.id);
            if (!current) return end();
            const desired = { x: floor.x + d.origin.x - grab.x, z: floor.z + d.origin.z - grab.z };
            if (multi) {
              // Das gegriffene Möbel rastet an nicht mitbewegten Möbeln/Wänden ein; die übrigen
              // folgen mit demselben Versatz, begrenzt so, dass alle im Raum bleiben.
              const others = all.filter((f) => !ids.includes(f.id) || f.id === item.id);
              const result = computeFurnitureMove({ ...current, position: original }, desired, others, d, metersPerPixel);
              const delta = { x: result.position.x - original.x, z: result.position.z - original.z };
              const start = formation.map((f) => ({ ...(all.find((a) => a.id === f.id) ?? f), position: originals[f.id] }));
              latest.current.onSetPositions?.(moveFormation(start, delta, d));
              setGuideState(result.guides.length ? { guides: result.guides, pixelsPerMeter: 1 / metersPerPixel } : null);
              return;
            }
            const result = computeFurnitureMove(current, desired, all, d, metersPerPixel);
            if (result.position.x !== current.position.x || result.position.z !== current.position.z) {
              update(current.id, { position: result.position });
            }
            setGuideState(result.guides.length ? { guides: result.guides, pixelsPerMeter: 1 / metersPerPixel } : null);
          },
          onCancel: () =>
            multi ? latest.current.onSetPositions?.(originals) : latest.current.onUpdate(item.id, { position: original }),
          onEnd: () => {
            setActive(null);
            setGuideState(null);
            latest.current.onGestureEnd?.();
          },
        },
        'grabbing',
      );
      // Erst nach dem Start melden: `begin` beendet ggf. eine alte Sitzung (deren Ende-Meldung).
      latest.current.onGestureStart?.();
    },
    [begin, end, pointerToFloor],
  );

  const startRotate = useCallback(
    (item: FurnitureItem, pointer: PointerStart) => {
      const { room: dims } = latest.current;
      const center = furnitureToWorld(item.position, dims);
      const startPoint = pointerToFloor(pointer.clientX, pointer.clientY);
      const startAngle = startPoint ? planAngleDeg(center, startPoint) : item.rotationDeg;
      const original = { rotationDeg: item.rotationDeg, position: item.position };
      setActive({ kind: 'rotate', id: item.id });
      begin(
        {
          ...pointer,
          startTolerancePx: 1,
          onMove: (floor) => {
            const delta = planAngleDeg(center, floor) - startAngle;
            // Immer von der Ausgangsposition aus normalisieren: Dreht man zurück,
            // kehrt ein an der Wand eingerücktes Möbel an seinen Platz zurück.
            latest.current.onUpdate(item.id, {
              rotationDeg: snapRotation(original.rotationDeg + delta),
              position: original.position,
            });
          },
          onCancel: () => latest.current.onUpdate(item.id, original),
          onEnd: () => {
            setActive(null);
            latest.current.onGestureEnd?.();
          },
        },
        'grabbing',
      );
      // Erst nach dem Start melden: `begin` beendet ggf. eine alte Sitzung (deren Ende-Meldung).
      latest.current.onGestureStart?.();
    },
    [begin, pointerToFloor],
  );

  const startRotateMany = useCallback(
    (ids: readonly string[], pointer: PointerStart) => {
      const { room: dims, furniture: all } = latest.current;
      const items = all.filter((f) => ids.includes(f.id));
      if (items.length === 0) return;
      // Drehpunkt: Mitte der Auswahl (Grundriss) – wie der Auswahlrahmen.
      const pivot = formationCenter(items);
      const pivotWorld = furnitureToWorld(pivot, dims);
      const startPoint = pointerToFloor(pointer.clientX, pointer.clientY);
      const startAngle = startPoint ? planAngleDeg(pivotWorld, startPoint) : 0;
      const originals: Record<string, FurnitureTransform> = Object.fromEntries(items.map((f) => [f.id, { position: f.position, rotationDeg: f.rotationDeg }]));
      setActive({ kind: 'rotate-many', ids, delta: 0 });
      begin(
        {
          ...pointer,
          startTolerancePx: 1,
          onMove: (floor) => {
            // Gleiches Raster wie beim einzelnen Möbel: 5°, kräftiger bei 0/90/180/270°.
            const delta = snapRotation(planAngleDeg(pivotWorld, floor) - startAngle);
            // Immer vom Ausgangszustand aus: Zurückdrehen stellt die Lage exakt wieder her.
            const transforms = rotateFormation(items, pivot, delta, latest.current.room);
            if (!transforms) return; // in diesem Winkel passt die Formation nicht in den Raum
            latest.current.onSetTransforms?.(transforms);
            setActive({ kind: 'rotate-many', ids, delta });
          },
          onCancel: () => latest.current.onSetTransforms?.(originals),
          onEnd: () => {
            setActive(null);
            latest.current.onGestureEnd?.();
          },
        },
        'grabbing',
      );
      latest.current.onGestureStart?.();
    },
    [begin, pointerToFloor],
  );

  // Wechsel in die Vorschau (bzw. Unmount) beendet eine laufende Bearbeitung.
  useEffect(() => {
    if (!enabled) end();
  }, [enabled, end]);

  const api = useMemo<FurnitureInteractionApi | null>(
    () => (enabled ? { startMove, startRotate, startRotateMany, active } : null),
    [enabled, startMove, startRotate, startRotateMany, active],
  );

  // Hilfslinien über die ganze Umriss-Hülle (Welt).
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const ox = room.origin.x;
  const oz = room.origin.z;
  return (
    <FurnitureInteractionContext.Provider value={api}>
      {children}
      {enabled &&
        guideState?.guides.map((guide) => {
          const points: [number, number, number][] =
            guide.axis === 'x'
              ? [[guide.at - ox, GUIDE_Y, minZ - oz], [guide.at - ox, GUIDE_Y, maxZ - oz]]
              : [[minX - ox, GUIDE_Y, guide.at - oz], [maxX - ox, GUIDE_Y, guide.at - oz]];
          return (
            <Line
              key={`${guide.axis}-${guide.at}`}
              name={`furniture-snap-guide-${guide.axis}`}
              userData={{ snapKind: guide.kind }}
              points={points}
              color={SCENE_COLORS.selection}
              lineWidth={1.25}
              dashed
              dashSize={5}
              gapSize={4}
              dashScale={guideState.pixelsPerMeter}
              transparent
              opacity={0.8}
            />
          );
        })}
    </FurnitureInteractionContext.Provider>
  );
}
