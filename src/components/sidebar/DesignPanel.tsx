import { useId, useMemo, useState } from 'react';
import {
  FLOOR_MATERIAL_IDS,
  FLOOR_MATERIALS,
  LIGHTING_BRIGHTNESS,
  LIGHTING_PRESET_IDS,
  LIGHTING_PRESETS,
  WALL_COLOR_PRESETS,
  WALL_FINISH_IDS,
  WALL_FINISHES,
  wallColorOf,
  wallFinishOf,
} from '../../config/design';
import type { FloorMaterialId, HexColor, LightingPreset, LightingSettings, RoomDesign, WallFinish } from '../../types/design';
import { ChoiceField } from '../ui/ChoiceField';
import type { RoomModel } from '../../utils/room/model';
import { Button } from '../ui/Button';
import styles from './DesignPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface DesignPanelProps {
  design: RoomDesign;
  room: RoomModel;
  onFloorChange: (floor: FloorMaterialId) => void;
  onWallColorChange: (wallId: string, color: HexColor) => void;
  onAllWallsColorChange: (color: HexColor) => void;
  onWallFinishChange: (wallId: string, finish: WallFinish) => void;
  onAllWallsFinishChange: (finish: WallFinish) => void;
  onCeilingColorChange: (color: HexColor) => void;
  onLightingChange: (patch: Partial<LightingSettings>) => void;
  /** Ansichtsoption (kein Teil des Plans): Decke in der 3D-Bearbeitungsansicht zeigen. */
  showCeiling: boolean;
  onShowCeilingChange: (show: boolean) => void;
}

const FINISH_OPTIONS = WALL_FINISH_IDS.map((id) => ({ value: id, label: WALL_FINISHES[id].label }));
const LIGHTING_OPTIONS = LIGHTING_PRESET_IDS.map((id) => ({ value: id, label: LIGHTING_PRESETS[id].label }));

/** Sidebar-Bereich „Gestaltung“: Bodenbelag, Wände (Farbe, Oberfläche), Decke und Beleuchtung. */
export function DesignPanel({
  design,
  room,
  onFloorChange,
  onWallColorChange,
  onAllWallsColorChange,
  onWallFinishChange,
  onAllWallsFinishChange,
  onCeilingColorChange,
  onLightingChange,
  showCeiling,
  onShowCeilingChange,
}: DesignPanelProps) {
  const ceilingId = useId();
  const ceilingToggleId = useId();
  const brightnessId = useId();
  const [chosen, setChosen] = useState<string>(room.walls[0]?.id ?? '');
  // Gibt es die gewählte Wand nicht mehr (Grundriss geändert), gilt die erste.
  const side = room.wallById.has(chosen) ? chosen : (room.walls[0]?.id ?? '');
  const wall = room.wallById.get(side);
  const wallName = wall?.label ?? 'Wand';
  const colorId = useId();
  const color = wallColorOf(design, side);
  const allSame = room.walls.every((w) => wallColorOf(design, w.id) === color);
  const finish = wallFinishOf(design, side);
  const allSameFinish = room.walls.every((w) => wallFinishOf(design, w.id) === finish);
  const { lighting } = design;
  const mini = useMemo(() => miniPlan(room), [room]);

  return (
    <SidebarSection title="Gestaltung" testId="design-panel">
      <p className={styles.label}>Boden</p>
      <div className={styles.floors} role="group" aria-label="Bodenbelag">
        {FLOOR_MATERIAL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.floor}
            aria-pressed={design.floor === id}
            onClick={() => onFloorChange(id)}
            data-testid={`floor-option-${id}`}
          >
            <span className={styles.floorSwatch} style={{ background: FLOOR_MATERIALS[id].swatch }} aria-hidden="true" />
            {FLOOR_MATERIALS[id].label}
          </button>
        ))}
      </div>

      <p className={styles.label}>Wände</p>
      {/* Mini-Grundriss: jede Wand anklickbar, in ihrer Farbe */}
      <svg className={styles.plan} viewBox={mini.viewBox} role="group" aria-label="Wand auswählen" data-testid="wall-picker">
        <polygon points={mini.floor} className={styles.planFloor} />
        {room.walls.map((w, i) => {
          const quad = mini.walls[i];
          const pressed = w.id === side;
          return (
            <g
              key={w.id}
              role="button"
              tabIndex={0}
              aria-pressed={pressed}
              aria-label={w.label}
              className={styles.planWall}
              onClick={() => setChosen(w.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setChosen(w.id);
                }
              }}
              data-testid={`wall-option-${w.id}`}
            >
              <title>{w.label}</title>
              <polygon
                points={quad}
                fill={wallColorOf(design, w.id)}
                className={pressed ? `${styles.planWallLine} ${styles.planWallSelected}` : styles.planWallLine}
                strokeWidth={mini.stroke * 0.35}
              />
            </g>
          );
        })}
      </svg>

      <div className={styles.picker}>
        <input
          id={colorId}
          className={styles.color}
          type="color"
          value={color}
          aria-label={`Farbe ${wallName}`}
          onChange={(event) => onWallColorChange(side, event.target.value)}
          data-testid="wall-color-input"
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }} data-testid="wall-color-name">{wallName}</div>
          <div className={styles.hex} data-testid="wall-color-value">
            {color.toUpperCase()}
          </div>
        </div>
      </div>
      <div className={styles.presets} role="group" aria-label="Farbvorschläge">
        {WALL_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            className={styles.preset}
            style={{ background: preset.color }}
            aria-pressed={color === preset.color}
            aria-label={preset.label}
            title={preset.label}
            onClick={() => onWallColorChange(side, preset.color)}
            data-testid="wall-preset"
          />
        ))}
      </div>
      <Button onClick={() => onAllWallsColorChange(color)} disabled={allSame} block data-testid="wall-apply-all">
        Auf alle Wände anwenden
      </Button>

      <ChoiceField<WallFinish>
        label={`Oberfläche ${wallName}`}
        options={FINISH_OPTIONS}
        value={finish}
        onChange={(value) => onWallFinishChange(side, value)}
        testId="wall-finish"
      />
      <Button onClick={() => onAllWallsFinishChange(finish)} disabled={allSameFinish} block data-testid="wall-finish-apply-all">
        Oberfläche auf alle Wände
      </Button>

      <p className={styles.label}>Decke</p>
      <div className={styles.picker}>
        <input
          id={ceilingId}
          className={styles.color}
          type="color"
          value={design.ceilingColor}
          aria-label="Deckenfarbe"
          onChange={(event) => onCeilingColorChange(event.target.value)}
          data-testid="ceiling-color-input"
        />
        <label className={styles.check} htmlFor={ceilingToggleId}>
          <input
            id={ceilingToggleId}
            type="checkbox"
            checked={showCeiling}
            onChange={(event) => onShowCeilingChange(event.target.checked)}
            data-testid="ceiling-toggle"
          />
          Decke anzeigen
        </label>
      </div>
      <p className={styles.hint}>In der 3D-Bearbeitung ist die Decke ausgeblendet, in der Vorschau immer sichtbar. Oberfläche matt.</p>

      <p className={styles.label}>Beleuchtung</p>
      <ChoiceField<LightingPreset>
        label="Lichtstimmung"
        options={LIGHTING_OPTIONS}
        value={lighting.preset}
        onChange={(preset) => onLightingChange({ preset })}
        testId="lighting-preset"
      />
      <div className={styles.slider}>
        <label htmlFor={brightnessId}>Helligkeit</label>
        <input
          id={brightnessId}
          type="range"
          min={LIGHTING_BRIGHTNESS.min}
          max={LIGHTING_BRIGHTNESS.max}
          step={LIGHTING_BRIGHTNESS.step}
          value={lighting.brightness}
          onChange={(event) => onLightingChange({ brightness: Number(event.target.value) })}
          data-testid="lighting-brightness"
        />
        <span data-testid="lighting-brightness-value">{Math.round(lighting.brightness * 100)} %</span>
      </div>
    </SidebarSection>
  );
}

/** Grundriss verkleinert für die Wandauswahl (SVG, Wände als Linien entlang der Innenkante). */
function miniPlan(room: RoomModel) {
  const { minX, maxX, minZ, maxZ } = room.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ, 0.1);
  const stroke = size * 0.07;
  const pad = stroke * 1.4;
  // Jede Wand als Streifen außen an der Innenkante (eigene Fläche – gut anklickbar).
  const walls = room.walls.map((w) => {
    const ox = -w.inward.x * stroke;
    const oz = -w.inward.z * stroke;
    return [
      [w.planStart.x, w.planStart.z],
      [w.planEnd.x, w.planEnd.z],
      [w.planEnd.x + ox, w.planEnd.z + oz],
      [w.planStart.x + ox, w.planStart.z + oz],
    ]
      .map(([x, z]) => `${x},${z}`)
      .join(' ');
  });
  return {
    viewBox: `${minX - pad} ${minZ - pad} ${maxX - minX + 2 * pad} ${maxZ - minZ + 2 * pad}`,
    floor: room.polygon.map((p) => `${p.x},${p.z}`).join(' '),
    walls,
    stroke,
  };
}
