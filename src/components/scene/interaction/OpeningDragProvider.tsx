import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
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
import { Plane, Raycaster, Vector2, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { OPENING_DRAG_CONFIG } from '../../../config/openings';
import { PLAN_SYMBOL_CONFIG, SCENE_COLORS } from '../../../config/scene';
import type { FixturePatch, RoomFixture } from '../../../types/fixture';
import type { Opening, OpeningPatch } from '../../../types/opening';
import { computeDragPlacement, measureAgainstWall } from '../../../utils/openingDrag';
import type { WallSpanItem } from '../../../utils/openings';
import { wallPoint, type RoomModel } from '../../../utils/room/model';
import { WALL_FADE_CONFIG } from '../../../config/scene';
import { clamp } from '../../../utils/units';

/** Wandgebundenes Element, das entlang der Wände gezogen werden kann. */
export type DraggableWallItem = { kind: 'opening'; item: Opening } | { kind: 'fixture'; item: RoomFixture };

interface OpeningDragApi {
  /** `plan` = Grundriss (jedes Element greifbar), `model` = 3D Bearbeiten (nur ausgewählte). */
  mode: 'plan' | 'model';
  /** Startet das Ziehen eines Elements (linke Maustaste bzw. Finger). */
  startDrag: (target: Opening | DraggableWallItem, event: ThreeEvent<PointerEvent>) => void;
}

const OpeningDragContext = createContext<OpeningDragApi | null>(null);

/** `null`, wenn Ziehen nicht verfügbar ist (z. B. in der 3D-Vorschau). */
export function useOpeningDrag(): OpeningDragApi | null {
  return useContext(OpeningDragContext);
}

interface DragSession {
  id: string;
  kind: DraggableWallItem['kind'];
  pointerId: number;
  /** Greifpunkt relativ zur Elementmitte (Grundriss-Leserichtung). */
  grabFromCenter: number;
  startX: number;
  startY: number;
  moved: boolean;
  original: { wall: string; offset: number };
  captureTarget: HTMLElement;
  cleanup: () => void;
}

interface SnapGuide {
  key: string;
  points: [number, number, number][];
  /** 3D: Strichmuster in Metern (perspektivisch), Grundriss: in Bildschirmpixeln. */
  world?: boolean;
  /** Pixel pro Meter, damit Strichlängen in Bildschirmpixeln konstant bleiben. */
  pixelsPerMeter: number;
}

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/** Minimale Schnittstelle der Kamerasteuerung, die während des Ziehens pausiert wird. */
interface PausableControls {
  enabled: boolean;
}

interface OpeningDragProviderProps {
  enabled: boolean;
  /** `model`: 3D Bearbeiten – Zeiger wird auf die Wandfläche statt auf den Boden projiziert. */
  mode?: 'plan' | 'model';
  room: RoomModel;
  openings: readonly Opening[];
  fixtures?: readonly RoomFixture[];
  onMove: (id: string, patch: OpeningPatch) => void;
  onMoveFixture?: (id: string, patch: FixturePatch) => void;
  /** Anfang/Ende einer Ziehbewegung – für den Verlauf (eine Geste = ein Schritt). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  children: ReactNode;
}

const NO_FIXTURES: readonly RoomFixture[] = [];

/**
 * Direktes Verschieben von Türen/Fenstern und Raumobjekten (Heizkörper, Steckdosen,
 * Schalter) entlang der Wände im Grundriss. Der Zustand liegt bewusst
 * hier und nicht im Element: Beim Wandwechsel wird das Element unter einer anderen
 * Wand neu gemountet, das Ziehen muss trotzdem nahtlos weiterlaufen.
 */
export function OpeningDragProvider({
  enabled,
  mode = 'plan',
  room,
  openings,
  fixtures = NO_FIXTURES,
  onMove,
  onMoveFixture,
  onGestureStart,
  onGestureEnd,
  children,
}: OpeningDragProviderProps) {
  const get = useThree((state) => state.get);
  const latest = useRef({ room, openings, fixtures, onMove, onMoveFixture, onGestureStart, onGestureEnd });
  useLayoutEffect(() => {
    latest.current = { room, openings, fixtures, onMove, onMoveFixture, onGestureStart, onGestureEnd };
  });

  /** Aktuelles Element, seine Nachbarn fürs Einrasten und die passende Änderungsfunktion. */
  const resolve = useCallback((kind: DraggableWallItem['kind'], id: string) => {
    const { openings: allOpenings, fixtures: allFixtures, onMove: moveOpening, onMoveFixture: moveFixture } = latest.current;
    if (kind === 'opening') {
      const item = allOpenings.find((o) => o.id === id);
      return item ? { item, neighbors: allOpenings as readonly WallSpanItem[], move: moveOpening, alignCenters: false } : null;
    }
    const item = allFixtures.find((f) => f.id === id);
    if (!item || !moveFixture) return null;
    // Raumobjekte rasten an gleichartigen Objekten und an Öffnungen ein (auch mittig, z. B. unter einem Fenster).
    const neighbors = [...allFixtures.filter((f) => f.type === item.type), ...allOpenings];
    return { item, neighbors: neighbors as readonly WallSpanItem[], move: moveFixture, alignCenters: true };
  }, []);

  const session = useRef<DragSession | null>(null);
  const [guide, setGuide] = useState<SnapGuide | null>(null);
  const tools = useMemo(() => ({ raycaster: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), plane: new Plane(), normal: new Vector3(), point: new Vector3() }), []);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const setControlsEnabled = useCallback(
    (value: boolean) => {
      const controls = get().controls as PausableControls | null;
      if (controls) controls.enabled = value;
    },
    [get],
  );

  const endDrag = useCallback(() => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    current.cleanup();
    if (current.captureTarget.hasPointerCapture(current.pointerId)) {
      current.captureTarget.releasePointerCapture(current.pointerId);
    }
    setControlsEnabled(true);
    setGuide(null);
    document.body.style.cursor = '';
    latest.current.onGestureEnd?.();
  }, [setControlsEnabled]);

  const startDrag = useCallback(
    (target: Opening | DraggableWallItem, event: ThreeEvent<PointerEvent>) => {
      const { kind, item: opening } = 'kind' in target ? target : ({ kind: 'opening', item: target } as const);
      endDrag();
      // Synchron pausieren: Die Kamerasteuerung erhält dasselbe pointerdown direkt danach.
      setControlsEnabled(false);
      latest.current.onGestureStart?.();

      const frame = latest.current.room.wallById.get(opening.wall);
      if (!frame) return endDrag();
      const { along } = measureAgainstWall(frame, { x: event.point.x, z: event.point.z });
      const fromCenter = clamp(along - opening.offset, 0, opening.width) - opening.width / 2;
      const captureTarget = get().gl.domElement;
      captureTarget.setPointerCapture(event.pointerId);

      const onPointerMove = (e: PointerEvent) => {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        if (!s.moved) {
          if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < OPENING_DRAG_CONFIG.dragStartTolerancePx) return;
          s.moved = true;
        }
        const state = get();
        const rect = state.gl.domElement.getBoundingClientRect();
        tools.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        tools.raycaster.setFromCamera(tools.ndc, state.camera);

        const { room: dims } = latest.current;
        const resolved = resolve(s.kind, s.id);
        if (!resolved) return endDrag();
        const { item: current, neighbors, move, alignCenters } = resolved;
        const model3d = modeRef.current === 'model';
        if (model3d) {
          const frame3d = dims.wallById.get(current.wall);
          if (!frame3d || !pointOnWalls(tools, frame3d, state.scene)) return;
        } else if (!tools.raycaster.ray.intersectPlane(FLOOR_PLANE, tools.hit)) return;
        const metersPerPixel = model3d
          ? perspectiveMetersPerPixel(state.camera as PerspectiveCamera, tools.hit, state.size.height)
          : 1 / Math.max(state.camera.zoom, 1e-6);
        const placement = computeDragPlacement(
          current,
          { x: tools.hit.x, z: tools.hit.z },
          s.grabFromCenter,
          neighbors,
          dims,
          metersPerPixel,
          alignCenters,
        );
        if (placement.wall !== current.wall || placement.offset !== current.offset) {
          move(current.id, { wall: placement.wall, offset: placement.offset });
        }
        document.body.style.cursor = 'grabbing';

        if (!placement.snap) {
          setGuide(null);
          return;
        }
        const guideFrame = dims.wallById.get(placement.wall);
        if (!guideFrame) return;
        if (model3d) {
          // 3D: senkrechte Linie auf der Wand-Innenfläche.
          const p = wallPoint(guideFrame, placement.snap.along, 0.01);
          const key = `${placement.wall}:${placement.snap.along}:3d`;
          setGuide((prev) =>
            prev?.key === key ? prev : { key, points: [[p.x, 0, p.z], [p.x, guideFrame.height, p.z]], pixelsPerMeter: 1, world: true },
          );
          return;
        }
        const y = dims.dimensions.height + PLAN_SYMBOL_CONFIG.lineElevation + 0.01;
        const outer = wallPoint(guideFrame, placement.snap.along, -guideFrame.thickness - 10 * metersPerPixel);
        const inner = wallPoint(guideFrame, placement.snap.along, 18 * metersPerPixel);
        const key = `${placement.wall}:${placement.snap.along}:${metersPerPixel}`;
        setGuide((prev) =>
          prev?.key === key
            ? prev
            : { key, points: [[outer.x, y, outer.z], [inner.x, y, inner.z]], pixelsPerMeter: 1 / metersPerPixel },
        );
      };

      const onPointerUp = (e: PointerEvent) => {
        if (session.current && e.pointerId === session.current.pointerId) endDrag();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const s = session.current;
        if (e.key !== 'Escape' || !s) return;
        // Abbrechen: ursprüngliche Lage wiederherstellen.
        resolve(s.kind, s.id)?.move(s.id, s.original);
        endDrag();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('keydown', onKeyDown);

      session.current = {
        id: opening.id,
        kind,
        pointerId: event.pointerId,
        grabFromCenter: frame.readingReversed ? -fromCenter : fromCenter,
        startX: event.nativeEvent.clientX,
        startY: event.nativeEvent.clientY,
        moved: false,
        original: { wall: opening.wall, offset: opening.offset },
        captureTarget,
        cleanup: () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
          window.removeEventListener('keydown', onKeyDown);
        },
      };
    },
    [endDrag, get, resolve, setControlsEnabled, tools],
  );

  // Wechsel in die 3D-Ansicht oder Unmount beendet ein laufendes Ziehen sauber.
  useEffect(() => {
    if (!enabled) endDrag();
  }, [enabled, endDrag]);
  useEffect(() => endDrag, [endDrag]);

  // Ansichtswechsel (Grundriss ↔ 3D) beendet ein laufendes Ziehen.
  useEffect(() => endDrag(), [mode, endDrag]);

  const api = useMemo<OpeningDragApi | null>(() => (enabled ? { mode, startDrag } : null), [enabled, mode, startDrag]);

  return (
    <OpeningDragContext.Provider value={api}>
      {children}
      {enabled && guide && (
        <Line
          name="snap-guide"
          points={guide.points}
          color={SCENE_COLORS.selection}
          lineWidth={1.5}
          dashed
          dashSize={guide.world ? 0.08 : 4}
          gapSize={guide.world ? 0.06 : 3}
          dashScale={guide.pixelsPerMeter}
        />
      )}
    </OpeningDragContext.Provider>
  );
}

type DragTools = { raycaster: Raycaster; hit: Vector3; plane: Plane; normal: Vector3; point: Vector3 };

/**
 * 3D: Zeigerposition auf der Wand. Primär die Ebene der aktuellen Wand-Innenfläche – so bleibt
 * das Element ruhig unter dem Zeiger, auch wenn der Strahl durch die eigene Öffnung fällt.
 * Verlässt der Zeiger die Wand seitlich, zählt die sichtbare Wand unter dem Zeiger (Wandwechsel).
 */
function pointOnWalls(tools: DragTools, frame: RoomModel['walls'][number], scene: Object3D): boolean {
  const { raycaster, hit, plane, normal, point } = tools;
  normal.set(frame.inward.x, 0, frame.inward.z);
  point.set(frame.start.x, 0, frame.start.z);
  plane.setFromNormalAndCoplanarPoint(normal, point);
  const onPlane = raycaster.ray.intersectPlane(plane, hit) !== null;
  if (onPlane) {
    const along = (hit.x - frame.start.x) * frame.axis.x + (hit.z - frame.start.z) * frame.axis.z;
    if (along >= 0 && along <= frame.length) return true;
  }
  const room = scene.getObjectByName('room');
  if (room) {
    const bodies: Mesh[] = [];
    room.traverse((object) => {
      const wallGroup = object.parent;
      if ((object as Mesh).isMesh && object.userData.wallId && (wallGroup?.userData.visibility ?? 1) >= WALL_FADE_CONFIG.interactiveThreshold) {
        bodies.push(object as Mesh);
      }
    });
    const first = raycaster.intersectObjects(bodies, false)[0];
    if (first) {
      hit.copy(first.point);
      return true;
    }
  }
  return onPlane;
}

/** Meter je Bildschirmpixel am Punkt (Perspektive: Entfernung und Sichtfeld). */
function perspectiveMetersPerPixel(camera: PerspectiveCamera, at: Vector3, viewportHeight: number): number {
  if (!camera.isPerspectiveCamera) return 1 / Math.max(camera.zoom, 1e-6);
  const distance = camera.position.distanceTo(at);
  return (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(viewportHeight, 1);
}
