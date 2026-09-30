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
import { usePlanPointerSession, type PointerStart } from './usePlanPointerSession';

export interface FurnitureInteractionApi {
  /**
   * Verschieben starten (linke Maustaste auf dem Möbel im Grundriss). `ids`: alle
   * gemeinsam zu verschiebenden Möbel (Mehrfachauswahl/Gruppe); das gegriffene rastet ein.
   */
  startMove: (item: FurnitureItem, event: ThreeEvent<PointerEvent>, ids?: readonly string[]) => void;
  /** Drehen starten (Rotations-Handle). */
  startRotate: (item: FurnitureItem, pointer: PointerStart) => void;
  /** Laufende Bearbeitung, z. B. für die Winkelanzeige am Handle. */
  active: { kind: 'move' | 'rotate'; id: string } | null;
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
  /** Anfang/Ende einer Zieh- oder Drehbewegung – für den Verlauf (eine Geste = ein Schritt). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  children: ReactNode;
}

/**
 * Verschieben und Drehen von Möbeln im Grundriss. Alle Änderungen laufen über
 * `onUpdate` in den Reducer – dort werden Maße, Rotation und Raumgrenzen normalisiert,
 * daher zeigt die Sidebar die Werte live an.
 */
export function FurnitureInteractionProvider({
  enabled,
  room,
  furniture,
  onUpdate,
  onSetPositions,
  onGestureStart,
  onGestureEnd,
  children,
}: FurnitureInteractionProviderProps) {
  const latest = useRef({ room, furniture, onUpdate, onSetPositions, onGestureStart, onGestureEnd });
  useLayoutEffect(() => {
    latest.current = { room, furniture, onUpdate, onSetPositions, onGestureStart, onGestureEnd };
  });

  const { begin, end, pointerToFloor } = usePlanPointerSession();
  const [active, setActive] = useState<FurnitureInteractionApi['active']>(null);
  const [guideState, setGuideState] = useState<GuideState | null>(null);

  const startMove = useCallback(
    (item: FurnitureItem, event: ThreeEvent<PointerEvent>, ids: readonly string[] = [item.id]) => {
      const { room: dims, furniture: startFurniture, onSetPositions: setPositions } = latest.current;
      // Greifpunkt relativ zum Mittelpunkt, damit das Möbel nicht zum Zeiger springt.
      const grab = { x: event.point.x + dims.origin.x - item.position.x, z: event.point.z + dims.origin.z - item.position.z };
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
    [begin, end],
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

  // Wechsel in die 3D-Ansicht beendet eine laufende Bearbeitung.
  useEffect(() => {
    if (!enabled) end();
  }, [enabled, end]);

  const api = useMemo<FurnitureInteractionApi | null>(
    () => (enabled ? { startMove, startRotate, active } : null),
    [enabled, startMove, startRotate, active],
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
