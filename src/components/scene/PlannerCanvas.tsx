import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { SCENE_COLORS } from '../../config/scene';
import type { CollisionReport, CollisionSeverity } from '../../collision';
import type { FurniturePickMode } from '../../state/plannerState';
import type { RoomDesign } from '../../types/design';
import type { FixturePatch, RoomFixture } from '../../types/fixture';
import type { FurnitureGroup, FurnitureItem, FurniturePatch } from '../../types/furniture';
import type { Opening, OpeningPatch } from '../../types/opening';
import type { FloorPoint } from '../../types/room';
import type { ViewMode } from '../../types/view';
import { openingColliders } from '../../collision/colliders';
import { rectanglePolygon } from '../../collision/geometry';
import { FURNITURE_CATALOG } from '../../config/furniture';
import { fitShapeOf } from '../../utils/camera';
import { furnitureToWorld } from '../../utils/furniture';
import type { RoomModel } from '../../utils/room/model';
import { DevSceneBridge } from './DevSceneBridge';
import { FurnitureClearances } from './furniture/clearance/FurnitureClearances';
import { FurnitureLayer } from './furniture/FurnitureLayer';
import { SelectionBounds } from './furniture/SelectionBounds';
import { FurnitureInteractionProvider } from './interaction/FurnitureInteractionProvider';
import { OpeningDragProvider } from './interaction/OpeningDragProvider';
import { RoomEditor } from './interaction/RoomEditor';
import { SelectionMarquee } from './interaction/SelectionMarquee';
import { PerspectiveView } from './PerspectiveView';
import { Room } from './room/Room';
import { SceneGrid } from './SceneGrid';
import { LampLights } from './LampLights';
import { SceneCapture, type SceneCaptureApi } from './SceneCapture';
import { SceneLights } from './SceneLights';
import { TopView } from './TopView';

interface PlannerCanvasProps {
  room: RoomModel;
  /** Export: Zugriff auf die Aufnahme der aktuellen Ansicht. */
  onCaptureReady?: (api: SceneCaptureApi | null) => void;
  /** Grundriss-Editor aktiv (nur in 2D wirksam). */
  roomEditing: boolean;
  selectedWallId: string | null;
  selectedCornerId: string | null;
  onSelectWall: (id: string) => void;
  onSelectCorner: (id: string) => void;
  onMoveCorner: (wallId: string, point: FloorPoint) => void;
  /** Erhöht sich bei neuer Raumform – 2D-Ansicht neu einpassen. */
  layoutToken: number;
  /** 3D-Vorschau: realistisch (Decke, keine ausgeblendeten Wände, Kamera im Raum). */
  preview?: boolean;
  /** Decke in der 3D-Bearbeitungsansicht zeigen. */
  showCeiling?: boolean;
  design: RoomDesign;
  openings: readonly Opening[];
  furniture: readonly FurnitureItem[];
  fixtures: readonly RoomFixture[];
  groups: readonly FurnitureGroup[];
  selectedOpeningId: string | null;
  selectedFixtureId: string | null;
  /** Primär ausgewähltes Möbel (Abstandsmaße). */
  selectedFurnitureId: string | null;
  /** Alle ausgewählten Möbel. */
  selectedFurnitureIds: readonly string[];
  collisions: CollisionReport;
  onSelectOpening: (id: string | null) => void;
  onSelectFixture: (id: string) => void;
  onPickFurniture: (id: string, mode: FurniturePickMode) => void;
  onSelectFurnitureMany: (ids: string[]) => void;
  onUpdateOpening: (id: string, patch: OpeningPatch) => void;
  onUpdateFixture: (id: string, patch: FixturePatch) => void;
  onUpdateFurniture: (id: string, patch: FurniturePatch) => void;
  onSetFurniturePositions: (positions: Record<string, FloorPoint>) => void;
  /** Anfang/Ende einer Zieh-/Drehbewegung im Grundriss (Verlauf: ein Schritt je Geste). */
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  viewMode: ViewMode;
  /** Erhöhen, um die Kameras auf den aktuellen Raum einzupassen (Projekt öffnen/neu). */
  cameraFitToken?: number;
}

/**
 * Eine gemeinsame Szene für beide Ansichten. Beide Kameras bleiben dauerhaft
 * gemountet; der Ansichtsmodus bestimmt nur, welche Kamera/Steuerung aktiv ist.
 * So bleibt z. B. die 3D-Kameraposition beim Wechsel 2D ↔ 3D erhalten.
 */
const NO_SEVERITY: ReadonlyMap<string, CollisionSeverity> = new Map();

export function PlannerCanvas({
  room,
  onCaptureReady,
  roomEditing,
  selectedWallId,
  selectedCornerId,
  onSelectWall,
  onSelectCorner,
  onMoveCorner,
  layoutToken,
  preview = false,
  showCeiling = false,
  design,
  openings,
  furniture,
  fixtures,
  groups,
  selectedOpeningId,
  selectedFixtureId,
  selectedFurnitureId,
  selectedFurnitureIds,
  collisions,
  onSelectOpening,
  onSelectFixture,
  onPickFurniture,
  onSelectFurnitureMany,
  onUpdateOpening,
  onUpdateFixture,
  onUpdateFurniture,
  onSetFurniturePositions,
  onGestureStart,
  onGestureEnd,
  viewMode,
  cameraFitToken = 0,
}: PlannerCanvasProps) {
  // Maße zum Zeitpunkt des Einpassens festhalten: Spätere Maßänderungen bewegen die
  // 3D-Kamera bewusst nicht – nur Start und Projektwechsel (neues Token).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fitShape3d = useMemo(() => fitShapeOf(room), [cameraFitToken]);
  const isPlan = viewMode === '2d';
  const editing = isPlan && roomEditing;
  // Hohe Möbel (über Augenhöhe) und Türschwenkbereiche (offenes Türblatt) als Hindernisse
  // für den Start der Vorschaukamera – sie soll nicht direkt davor stehen.
  const tallFurniture = useMemo(
    () => [
      ...furniture
        .filter((f) => f.height > 1.2 && !FURNITURE_CATALOG[f.type].mount)
        .map((f) => rectanglePolygon(furnitureToWorld(f.position, room), f.width / 2 + 0.3, f.depth / 2 + 0.3, f.rotationDeg)),
      ...openings.flatMap((o) => openingColliders(o, room).filter((c) => c.kind === 'doorSwing').map((c) => c.footprint)),
    ],
    [furniture, openings, room],
  );
  const previewing = !isPlan && preview;
  // 2D neu einpassen: bei Projektwechsel, neuer Raumform und – wie bisher – bei geänderten
  // Rechteckmaßen. Bearbeitungen im Grundriss-Editor lassen die Ansicht stehen.
  const rectangleKey = useRef('');
  if (room.plan.shape === 'rectangle' && room.isRectangle && !editing) {
    rectangleKey.current = `${room.dimensions.width}x${room.dimensions.length}`;
  }
  const fitKey = `${cameraFitToken}|${layoutToken}|${rectangleKey.current}`;
  const fitShape2d = fitShapeOf(room);
  const selectedFurniture = furniture.find((f) => f.id === selectedFurnitureId) ?? null;
  const selectedItems = useMemo(
    () => furniture.filter((f) => selectedFurnitureIds.includes(f.id)),
    [furniture, selectedFurnitureIds],
  );
  // Abstandsmaße nur bei genau einem ausgewählten Möbel – bei Mehrfachauswahl zeigt ein Rahmen die Auswahl.
  const single = selectedFurniture && selectedItems.length === 1;

  return (
    <Canvas
      shadows
      flat
      dpr={[1, 2]}
      // Klick ins Leere (ohne Ziehen) hebt die Auswahl auf.
      onPointerMissed={() => onSelectOpening(null)}
      // Ein Klick in die Szene beendet eine Feldbearbeitung in der Sidebar (Fokus verlassen),
      // damit Tastenkürzel (Entf, Pfeiltasten, Strg/⌘+D …) wieder auf die Auswahl wirken.
      onPointerDownCapture={(event) => {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body && !event.currentTarget.contains(active)) active.blur();
      }}
    >
      <color attach="background" args={[SCENE_COLORS.background]} />
      <SceneLights lighting={design.lighting} bounds={room.outerBounds} />
      <LampLights furniture={furniture} room={room} enabled={!isPlan} />
      <SceneGrid />
      <OpeningDragProvider
        enabled={isPlan}
        room={room}
        openings={openings}
        fixtures={fixtures}
        onMove={onUpdateOpening}
        onMoveFixture={onUpdateFixture}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      >
        <Room
          room={room}
          design={design}
          openings={openings}
          selectedOpeningId={selectedOpeningId}
          fixtures={fixtures}
          selectedFixtureId={selectedFixtureId}
          severityById={previewing ? NO_SEVERITY : collisions.severityById}
          onSelectOpening={onSelectOpening}
          onSelectFixture={onSelectFixture}
          preview={previewing}
          showCeiling={previewing || showCeiling}
          selectedWallId={editing ? selectedWallId : null}
          onSelectWall={editing ? onSelectWall : null}
          variant={isPlan ? 'plan' : 'model'}
        />
      </OpeningDragProvider>
      {editing && (
        <RoomEditor
          room={room}
          selectedCornerId={selectedCornerId}
          onSelectCorner={onSelectCorner}
          onMoveCorner={onMoveCorner}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
        />
      )}
      <FurnitureInteractionProvider
        enabled={isPlan}
        room={room}
        furniture={furniture}
        onUpdate={onUpdateFurniture}
        onSetPositions={onSetFurniturePositions}
        onGestureStart={onGestureStart}
        onGestureEnd={onGestureEnd}
      >
        <FurnitureLayer
          furniture={furniture}
          groups={groups}
          room={room}
          variant={isPlan ? 'plan' : 'model'}
          selectedIds={selectedFurnitureIds}
          // Vorschau realistisch: keine Kollisionsrahmen (Hinweise bleiben in der Seitenleiste).
          severityById={previewing ? NO_SEVERITY : collisions.severityById}
          onPick={onPickFurniture}
        />
        {isPlan && (
          <SelectionMarquee
            room={room}
            furniture={furniture}
            selectedIds={selectedFurnitureIds}
            onSelectMany={onSelectFurnitureMany}
            onClear={() => onSelectOpening(null)}
          />
        )}
      </FurnitureInteractionProvider>
      <PerspectiveView active={!isPlan} fitShape={fitShape3d} fitToken={cameraFitToken} preview={previewing} room={room} obstacles={tallFurniture} />
      <TopView
        active={isPlan}
        room={room}
        fitShape={fitShape2d}
        fitKey={fitKey}
        overlay={(metersPerPixel) => (
          <>
            {single && (
              <FurnitureClearances
                item={selectedFurniture}
                furniture={furniture}
                room={room}
                fixtures={fixtures}
                metersPerPixel={metersPerPixel}
                onMove={(id, position) => onUpdateFurniture(id, { position })}
              />
            )}
            {selectedItems.length > 1 && (
              <SelectionBounds items={selectedItems} room={room} metersPerPixel={metersPerPixel} />
            )}
          </>
        )}
      />
      {onCaptureReady && <SceneCapture onReady={onCaptureReady} />}
      {import.meta.env.DEV && <DevSceneBridge />}
    </Canvas>
  );
}
