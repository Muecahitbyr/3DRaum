import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import { describeCollisions, type ObjectRef } from './collision';
import { HistoryControls } from './components/layout/HistoryControls';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExportDialog, type ExportKind } from './components/export/ExportDialog';
import { Fallback } from './components/layout/Fallback';
import { MenuButton } from './components/layout/MenuButton';
import { PlannerLayout } from './components/layout/PlannerLayout';
import type { SceneCaptureApi } from './components/scene/SceneCapture';
import { STATUS_TEXT } from './components/projects/ProjectBar';
import { canvasToBlob, downloadBlob, projectFileBlob, safeFileName } from './export/files';
import { renderPlanImage } from './export/planImage';
import { buildReport } from './export/report';
import { COMPACT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { DEFAULT_PROJECT_NAME } from './projects/format';
import { isWebGLAvailable } from './utils/webgl';
import { FurnitureLibrary } from './components/library/FurnitureLibrary';
import { ProjectManager } from './components/projects/ProjectManager';
import { Workspace } from './components/layout/Workspace';
import { PlannerCanvas } from './components/scene/PlannerCanvas';
import { DesignPanel } from './components/sidebar/DesignPanel';
import { FixturePropertiesPanel } from './components/sidebar/FixturePropertiesPanel';
import { FixturesPanel } from './components/sidebar/FixturesPanel';
import { FurniturePanel } from './components/sidebar/FurniturePanel';
import { FurniturePropertiesPanel } from './components/sidebar/FurniturePropertiesPanel';
import { MultiSelectionPanel } from './components/sidebar/MultiSelectionPanel';
import { OpeningPropertiesPanel } from './components/sidebar/OpeningPropertiesPanel';
import { OpeningsPanel } from './components/sidebar/OpeningsPanel';
import { RoomPanel } from './components/sidebar/RoomPanel';
import { RoomFeedback } from './components/layout/RoomFeedback';
import { Sidebar } from './components/sidebar/Sidebar';
import { useCollisionReport } from './hooks/useCollisionReport';
import { useEditingShortcuts } from './hooks/useEditingShortcuts';
import { useHistoryShortcuts } from './hooks/useHistoryShortcuts';
import { usePlanner } from './hooks/usePlanner';
import { useProjectSession } from './hooks/useProjectSession';
import type { ViewMode } from './types/view';
import { getFixtureDisplayName } from './utils/fixtures';
import { getOpeningDisplayName } from './utils/openingLabels';

/** Eigenschaften-Bereiche der Seitenleiste (Möbel, Mehrfachauswahl, Tür/Fenster, Raumobjekt, Wand). */
const SELECTION_PANELS = [
  'furniture-properties',
  'multi-selection',
  'opening-properties',
  'fixture-properties',
  'wall-properties',
]
  .map((id) => `[data-testid="${id}"]`)
  .join(', ');

export function App() {
  const planner = usePlanner();
  const {
    state,
    room,
    selectedWallId,
    selectedCornerId,
    document: plan,
    selectedOpeningId,
    selectedFurnitureId,
    selectedFurnitureIds,
    selectedFixtureId,
    selectedOpening,
    selectedFurniture,
    selectedFixture,
    actions,
    history,
  } = planner;
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  // 3D: Bearbeiten (praktisch) oder Vorschau (realistisch). Decke optional in der Bearbeitung.
  const [preview, setPreview] = useState(false);
  const [showCeiling, setShowCeiling] = useState(false);
  const clearSelection = () => actions.selectOpening(null);
  // Grundriss-Editor: nur in 2D; Einschalten wechselt in die Draufsicht.
  const [roomEditing, setRoomEditing] = useState(false);
  const toggleRoomEditing = () => {
    if (!roomEditing) {
      setViewMode('2d');
      setPreview(false);
      // Schmale Bildschirme: Drawer schließen, damit der Grundriss frei ist.
      setDrawerOpen(false);
    }
    else if (selectedWallId || selectedCornerId) clearSelection();
    setRoomEditing(!roomEditing);
  };
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === '3d' && roomEditing) {
      setRoomEditing(false);
      if (selectedWallId || selectedCornerId) clearSelection();
    }
  };

  // Lokale Projekte: Öffnen/Neu ersetzt den Plan samt Verlauf und passt die Kamera neu ein.
  const projectSession = useProjectSession(plan, history.reset);
  const [cameraFitToken, setCameraFitToken] = useState(0);
  const handlePlanReplaced = useCallback(() => setCameraFitToken((token) => token + 1), []);
  // Neue Raumform: auch die 3D-Kamera neu einpassen.
  useEffect(() => {
    if (state.layoutToken > 0) setCameraFitToken((token) => token + 1);
  }, [state.layoutToken]);
  const [modalOpen, setModalOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const anyDialog = modalOpen || libraryOpen || exportOpen;
  useHistoryShortcuts(history, !anyDialog);
  useEditingShortcuts(planner, !anyDialog);

  // Schmale Bildschirme: Sidebar als Drawer; Auswahl im Plan öffnet ihn nicht ungefragt.
  const compact = useMediaQuery(COMPACT_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const projectName = projectSession.current?.name ?? DEFAULT_PROJECT_NAME;
  const projectStatus = projectSession.dirty ? 'dirty' : projectSession.current ? 'saved' : 'new';

  // ---------- Export (Bilder, PDF, Projektdatei)
  const webgl = isWebGLAvailable();
  const capture = useRef<SceneCaptureApi | null>(null);
  const onCaptureReady = useCallback((api: SceneCaptureApi | null) => {
    capture.current = api;
  }, []);
  const viewRef = useRef({ viewMode, preview });
  viewRef.current = { viewMode, preview };
  /** 3D-Vorschaubild; ist die Vorschau nicht offen, wird sie kurz geöffnet und danach zurückgestellt. */
  const capturePreview = async (): Promise<HTMLCanvasElement | null> => {
    if (!webgl || !capture.current) return null;
    const before = viewRef.current;
    const switching = before.viewMode !== '3d' || !before.preview;
    // Ausgewählte Türen/Fenster/Raumobjekte sind blau eingefärbt (Material, kein Hilfselement):
    // für die Aufnahme kurz abwählen, danach wieder auswählen (kein Verlaufsschritt).
    const tinted = state.selection?.kind === 'opening' || state.selection?.kind === 'fixture' ? state.selection : null;
    if (tinted) clearSelection();
    if (switching) {
      setViewMode('3d');
      setPreview(true);
    }
    if (switching || tinted) await frames(8);
    try {
      return capture.current?.capture(3200) ?? null;
    } finally {
      if (switching) {
        setViewMode(before.viewMode);
        setPreview(before.preview);
      }
      if (tinted?.kind === 'opening') actions.selectOpening(tinted.id);
      else if (tinted?.kind === 'fixture') actions.selectFixture(tinted.id);
    }
  };
  const runExport = async (kind: ExportKind): Promise<string> => {
    const planInput = { room, openings: state.openings, fixtures: state.fixtures, furniture: state.furniture };
    if (kind === 'project') {
      const fileName = safeFileName(projectName, '.3draum');
      downloadBlob(projectFileBlob(projectName, plan), fileName);
      return fileName;
    }
    if (kind === 'plan-png') {
      const fileName = safeFileName(projectName, ' – Grundriss.png');
      downloadBlob(await canvasToBlob(renderPlanImage(planInput)), fileName);
      return fileName;
    }
    if (kind === '3d-png') {
      const image = await capturePreview();
      if (!image) throw new Error('Die 3D-Ansicht ist nicht verfügbar.');
      const fileName = safeFileName(projectName, ' – 3D.png');
      downloadBlob(await canvasToBlob(image), fileName);
      return fileName;
    }
    const previewImage = await capturePreview().catch(() => null);
    const blob = await buildReport({ projectName, date: new Date(), plan, room, planImage: renderPlanImage(planInput, { maxSize: 2600 }), previewImage });
    const fileName = safeFileName(projectName, ' – Planungsbericht.pdf');
    downloadBlob(blob, fileName);
    return fileName;
  };

  // Verlauf: Eine Feldbearbeitung (Fokus bis Verlassen) ist EIN Schritt, auch wenn
  // Eingaben schon beim Tippen live übernommen werden. Gesten im Grundriss ebenso.
  const { begin, end } = history;
  const editId = (event: FocusEvent) => (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? `edit:${event.target.id}` : null);
  const handleSidebarFocus = (event: FocusEvent) => {
    const id = editId(event);
    if (id) begin(id, 'edit');
  };
  const handleSidebarBlur = (event: FocusEvent) => {
    const id = editId(event);
    if (id) end(id);
  };
  const startGesture = useCallback(() => begin('gesture', 'gesture'), [begin]);
  const endGesture = useCallback(() => end('gesture'), [end]);
  const collisions = useCollisionReport(state);

  const nameOf = useCallback(
    (ref: ObjectRef) => {
      if (ref.type === 'furniture') return state.furniture.find((f) => f.id === ref.id)?.name ?? 'einem Möbel';
      if (ref.type === 'wall') return room.wallById.get(ref.id)?.label ?? 'eine Wand';
      if (ref.type === 'fixture') {
        const fixture = state.fixtures.find((f) => f.id === ref.id);
        return fixture ? getFixtureDisplayName(fixture, state.fixtures) : 'einem Raumobjekt';
      }
      const opening = state.openings.find((o) => o.id === ref.id);
      return opening ? getOpeningDisplayName(opening, state.openings) : 'einer Öffnung';
    },
    [state.furniture, state.openings, state.fixtures, room],
  );

  const multiSelection = selectedFurnitureIds.length > 1;
  const selectedItems = multiSelection ? state.furniture.filter((f) => selectedFurnitureIds.includes(f.id)) : [];
  // Schmale Bildschirme: Name der Auswahl im Chip „… bearbeiten“.
  const selectionName = multiSelection
    ? `${selectedFurnitureIds.length} Möbel`
    : selectedFurniture?.name ??
      (selectedOpening && getOpeningDisplayName(selectedOpening, state.openings)) ??
      (selectedFixture && getFixtureDisplayName(selectedFixture, state.fixtures)) ??
      (selectedWallId && room.wallById.get(selectedWallId)?.label) ??
      null;
  // Chip „… bearbeiten“: Drawer öffnen und direkt zu den Eigenschaften der Auswahl springen.
  const openSelectionProperties = () => {
    setDrawerOpen(true);
    requestAnimationFrame(() =>
      document
        .querySelector(SELECTION_PANELS)
        ?.scrollIntoView({ block: 'start', behavior: 'auto' }),
    );
  };

  return (
    <PlannerLayout
      compact={compact}
      drawerOpen={drawerOpen}
      onDrawerClose={closeDrawer}
      sidebar={
        <Sidebar
          onFocusCapture={handleSidebarFocus}
          onBlurCapture={handleSidebarBlur}
          // Im Drawer (schmale Bildschirme) steht das Projekt in der Kopfzeile; sonst in der Projektleiste.
          project={compact ? { name: projectName, status: STATUS_TEXT[projectStatus] } : undefined}
          onClose={compact ? closeDrawer : undefined}
        >
          <RoomPanel
            room={room}
            editing={roomEditing}
            selectedWallId={selectedWallId}
            selectedCornerId={selectedCornerId}
            onDimensionChange={actions.setRoomDimension}
            onShapeChange={actions.setRoomShape}
            onLShapeChange={actions.setLShapeDimensions}
            onToggleEditing={toggleRoomEditing}
            onWallLengthChange={actions.setWallLength}
            onWallThicknessChange={actions.setWallThickness}
            onSplitWall={actions.splitWall}
            onRemoveWall={actions.removeWall}
            onCornerMove={actions.moveCorner}
            onRemoveCorner={actions.removeCorner}
          />
          <OpeningsPanel
            openings={state.openings}
            selectedOpeningId={selectedOpeningId}
            severityById={collisions.severityById}
            room={room}
            onAdd={actions.addOpening}
            onSelect={actions.selectOpening}
          />
          {selectedOpening && (
            <OpeningPropertiesPanel
              key={selectedOpening.id}
              opening={selectedOpening}
              openings={state.openings}
              room={room}
              collisionMessages={describeCollisions({ type: 'opening', id: selectedOpening.id }, collisions, nameOf)}
              onChange={actions.updateOpening}
              onDelete={actions.removeOpening}
              onClose={clearSelection}
            />
          )}
          <FixturesPanel
            fixtures={state.fixtures}
            selectedFixtureId={selectedFixtureId}
            severityById={collisions.severityById}
            room={room}
            onAdd={actions.addFixture}
            onSelect={actions.selectFixture}
          />
          {selectedFixture && (
            <FixturePropertiesPanel
              key={selectedFixture.id}
              fixture={selectedFixture}
              fixtures={state.fixtures}
              room={room}
              collisionMessages={describeCollisions({ type: 'fixture', id: selectedFixture.id }, collisions, nameOf)}
              onChange={actions.updateFixture}
              onDelete={actions.removeFixture}
              onClose={clearSelection}
            />
          )}
          <FurniturePanel
            furniture={state.furniture}
            selectedIds={selectedFurnitureIds}
            severityById={collisions.severityById}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSelect={(id, toggle) => (toggle ? actions.pickFurniture(id, 'toggle', false) : actions.selectFurniture(id))}
          />
          {selectedFurniture && !multiSelection && (
            <FurniturePropertiesPanel
              key={selectedFurniture.id}
              item={selectedFurniture}
              room={room}
              collisionMessages={describeCollisions({ type: 'furniture', id: selectedFurniture.id }, collisions, nameOf)}
              group={state.groups.find((g) => g.memberIds.includes(selectedFurniture.id)) ?? null}
              onChange={actions.updateFurniture}
              onDelete={actions.removeFurniture}
              onDuplicate={(id) => actions.duplicateFurniture([id])}
              onAlign={(id, mode) => actions.alignFurniture([id], mode)}
              onUngroup={actions.ungroupFurniture}
              onClose={clearSelection}
            />
          )}
          {multiSelection && (
            <MultiSelectionPanel
              items={selectedItems}
              groups={state.groups}
              onGroup={actions.groupFurniture}
              onUngroup={actions.ungroupFurniture}
              onDuplicate={actions.duplicateFurniture}
              onDelete={actions.removeFurnitureMany}
              onAlign={actions.alignFurniture}
              onClose={clearSelection}
            />
          )}
          <DesignPanel
            design={state.design}
            room={room}
            onFloorChange={actions.setFloorMaterial}
            onWallColorChange={actions.setWallColor}
            onAllWallsColorChange={actions.setAllWallColors}
            onWallFinishChange={actions.setWallFinish}
            onAllWallsFinishChange={actions.setAllWallFinishes}
            onCeilingColorChange={actions.setCeilingColor}
            onLightingChange={actions.setLighting}
            showCeiling={showCeiling}
            onShowCeilingChange={setShowCeiling}
          />
        </Sidebar>
      }
    >
      <Workspace
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        preview={preview}
        onPreviewChange={setPreview}
        notice={<RoomFeedback feedback={state.roomFeedback} />}
        actions={
          <>
            {compact && <MenuButton open={drawerOpen} onClick={() => setDrawerOpen((open) => !open)} />}
            <HistoryControls history={history} />
          </>
        }
        trailing={
          <ProjectManager
            session={projectSession}
            onPlanReplaced={handlePlanReplaced}
            onModalChange={setModalOpen}
            onOpenExport={() => setExportOpen(true)}
          />
        }
        bottom={
          compact && !drawerOpen && selectionName ? (
            <button
              type="button"
              className="selection-chip"
              onClick={openSelectionProperties}
              aria-label={`${selectionName}: Eigenschaften bearbeiten`}
              data-testid="selection-chip"
            >
              <span className="selection-chip-name">{selectionName}</span>
              <span aria-hidden="true">· bearbeiten</span>
            </button>
          ) : undefined
        }
      >
        {!webgl ? (
          <Fallback
            testId="webgl-missing"
            title="3D-Darstellung nicht verfügbar"
            message="Dieser Browser oder dieses Gerät unterstützt kein WebGL. Planen über die Seitenleiste, Speichern sowie Grundriss- und Projektexport funktionieren weiterhin."
          />
        ) : (
          <ErrorBoundary
            fallback={(_error, reset) => (
              <Fallback
                testId="scene-error"
                title="Die Darstellung wurde unterbrochen"
                message="Der Plan ist unverändert. Die Ansicht kann neu gestartet werden."
                action={{ label: 'Ansicht neu starten', onClick: reset }}
              />
            )}
          >
        <PlannerCanvas
          onCaptureReady={onCaptureReady}
          room={room}
          roomEditing={roomEditing}
          selectedWallId={selectedWallId}
          selectedCornerId={selectedCornerId}
          onSelectWall={actions.selectWall}
          onSelectCorner={actions.selectCorner}
          onMoveCorner={actions.moveCorner}
          layoutToken={state.layoutToken}
          preview={preview}
          showCeiling={showCeiling}
          design={state.design}
          openings={state.openings}
          furniture={state.furniture}
          fixtures={state.fixtures}
          groups={state.groups}
          selectedOpeningId={selectedOpeningId}
          selectedFixtureId={selectedFixtureId}
          selectedFurnitureId={selectedFurnitureId}
          selectedFurnitureIds={selectedFurnitureIds}
          collisions={collisions}
          onSelectOpening={actions.selectOpening}
          onSelectFixture={actions.selectFixture}
          onPickFurniture={actions.pickFurniture}
          onSelectFurnitureMany={actions.selectFurnitureMany}
          onUpdateOpening={actions.updateOpening}
          onUpdateFixture={actions.updateFixture}
          onUpdateFurniture={actions.updateFurniture}
          onSetFurniturePositions={actions.setFurniturePositions}
          onGestureStart={startGesture}
          onGestureEnd={endGesture}
          viewMode={viewMode}
          cameraFitToken={cameraFitToken}
        />
          </ErrorBoundary>
        )}
      </Workspace>
      {exportOpen && <ExportDialog onExport={runExport} canRender3d={webgl} onClose={() => setExportOpen(false)} />}
      {libraryOpen && (
        <FurnitureLibrary
          onAdd={(type) => {
            actions.addFurniture(type);
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </PlannerLayout>
  );
}

/** Einige Frames abwarten (Ansicht umschalten, Kamera setzen, rendern). */
function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (n: number) => (n <= 0 ? resolve() : requestAnimationFrame(() => step(n - 1)));
    step(count);
  });
}
