import { Html, Line } from '@react-three/drei';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { rectanglePolygon } from '../../../../collision/geometry';
import { SCENE_COLORS } from '../../../../config/scene';
import type { FurnitureItem } from '../../../../types/furniture';
import type { RoomFixture } from '../../../../types/fixture';
import type { FloorPoint } from '../../../../types/room';
import type { RoomModel } from '../../../../utils/room/model';
import { computeClearances, DIRECTION_VECTORS, positionForClearance, type Clearance } from '../../../../utils/furnitureClearance';
import { formatNumber, parseMeters } from '../../../../utils/units';
import styles from './FurnitureClearances.module.css';

/** Über Möbelsymbolen (0,016 m), ausgewähltem Möbel (+0,01 m) und Einrastlinien (0,03 m). */
const Y = 0.04;
const ARROW_PX = 7;
const TICK_PX = 5;
/**
 * Kürzere Strecken bekommen das Etikett seitlich neben das Möbel (außerhalb seiner
 * Grundfläche), damit die Linie sichtbar bleibt und das Etikett nicht über dem Möbel liegt –
 * sonst fängt es Finger/Maus ab, wenn das Möbel gegriffen werden soll. Abstand = halbe
 * Etikettgröße (quer zur Messrichtung) + Luft.
 */
const MIN_INLINE_PX = 48;
const LABEL_BESIDE_PX = { horizontal: 16, vertical: 30 };

type P3 = [number, number, number];

const HTML_PASS_THROUGH = { pointerEvents: 'none' } as const;
const NO_FIXTURES: readonly RoomFixture[] = [];

interface FurnitureClearancesProps {
  item: FurnitureItem;
  furniture: readonly FurnitureItem[];
  room: RoomModel;
  /** Heizkörper sind Hindernisse der Abstandsmessung. */
  fixtures?: readonly RoomFixture[];
  metersPerPixel: number;
  onMove: (id: string, position: FloorPoint) => void;
}

/**
 * Abstandsmaße des ausgewählten Möbels im Grundriss: Maßlinie mit Pfeilen und
 * Hilfsstrichen, Maßtext in cm (anklickbar → exakten Abstand eingeben).
 * Pfeile, Abstände und Beschriftung sind in Bildschirmpixeln definiert und
 * bleiben beim Zoomen gleich groß.
 */
export function FurnitureClearances({ item, furniture, room, fixtures = NO_FIXTURES, metersPerPixel, onMove }: FurnitureClearancesProps) {
  const clearances = useMemo(() => computeClearances(item, furniture, room, fixtures), [item, furniture, room, fixtures]);
  const footprint = useMemo(() => rectanglePolygon(item.position, item.width / 2, item.depth / 2, item.rotationDeg), [item]);
  const toWorld = (p: FloorPoint, y = Y): P3 => [p.x - room.origin.x, y, p.z - room.origin.z];

  return (
    <group name="furniture-clearances">
      {clearances.map((c) => (
        <ClearanceMeasure
          key={c.direction}
          clearance={c}
          footprint={footprint}
          toWorld={toWorld}
          metersPerPixel={metersPerPixel}
          onSubmit={(meters) => onMove(item.id, positionForClearance(item, c, meters))}
        />
      ))}
    </group>
  );
}

interface ClearanceMeasureProps {
  clearance: Clearance;
  /** Grundfläche des Möbels (Plan-Koordinaten) – kurze Maße werden daneben beschriftet. */
  footprint: readonly FloorPoint[];
  toWorld: (p: FloorPoint, y?: number) => P3;
  metersPerPixel: number;
  onSubmit: (meters: number) => void;
}

function ClearanceMeasure({ clearance: c, footprint, toWorld, metersPerPixel, onSubmit }: ClearanceMeasureProps) {
  const d = DIRECTION_VECTORS[c.direction];
  const n = { x: -d.z, z: d.x }; // senkrecht zur Messrichtung
  const px = (v: number) => v * metersPerPixel;
  const lengthPx = c.distance / metersPerPixel;
  const color = c.conflict ? SCENE_COLORS.conflict : SCENE_COLORS.selection;
  const at = (p: FloorPoint, along: number, across: number): FloorPoint => ({
    x: p.x + d.x * along + n.x * across,
    z: p.z + d.z * along + n.z * across,
  });

  const lines: P3[][] = [];
  if (c.conflict) {
    lines.push([toWorld(c.from), toWorld(c.to)]);
  } else if (lengthPx >= 1) {
    lines.push([toWorld(c.from), toWorld(c.to)]);
    // Pfeilspitzen zu beiden Enden, kurze Hilfsstriche an Möbel und Hindernis
    const arrow = Math.min(px(ARROW_PX), c.distance / 2);
    for (const [tip, dir] of [[c.to, -1], [c.from, 1]] as const) {
      lines.push([toWorld(at(tip, dir * arrow, arrow * 0.45)), toWorld(tip), toWorld(at(tip, dir * arrow, -arrow * 0.45))]);
      lines.push([toWorld(at(tip, 0, px(TICK_PX))), toWorld(at(tip, 0, -px(TICK_PX)))]);
    }
  }

  const mid = { x: (c.from.x + c.to.x) / 2, z: (c.from.z + c.to.z) / 2 };
  // Seitlich: über die Möbelkante (quer zur Messrichtung) hinaus.
  const beyond = Math.max(...footprint.map((p) => (p.x - c.from.x) * n.x + (p.z - c.from.z) * n.z));
  const beside = beyond + px(d.x !== 0 ? LABEL_BESIDE_PX.horizontal : LABEL_BESIDE_PX.vertical);
  const labelAt = c.conflict || lengthPx >= MIN_INLINE_PX ? mid : at(mid, 0, beside);

  return (
    <group name={`clearance-${c.direction}`}>
      {lines.map((points, i) => (
        <Line key={i} points={points} color={color} lineWidth={i === 0 ? 1.2 : 1.1} dashed={c.conflict} dashSize={4} gapSize={3} dashScale={1 / metersPerPixel} />
      ))}
      {/* Hülle für die Maus durchlässig (Drei wertet `pointerEvents` nur im transform-Modus aus);
          nur das bearbeitbare Etikett selbst nimmt Klicks an. Konflikt-Etiketten liegen oft über
          den Möbeln und bleiben durchlässig, damit das Möbel darunter greifbar bleibt. */}
      <Html position={toWorld(labelAt, Y + 0.001)} center zIndexRange={[12, 0]} style={HTML_PASS_THROUGH}>
        <ClearanceLabel clearance={c} onSubmit={onSubmit} />
      </Html>
    </group>
  );
}

/** Verhindert, dass Klicks auf das Etikett die Kamera pannen oder die Auswahl aufheben. */
const stop = (event: SyntheticEvent) => event.stopPropagation();

function ClearanceLabel({ clearance: c, onSubmit }: { clearance: Clearance; onSubmit: (meters: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cm = c.distance * 100;
  const common = {
    'data-testid': `clearance-${c.direction}`,
    'data-distance-cm': cm.toFixed(2),
    'data-conflict': String(c.conflict),
    'data-target': c.target.kind === 'wall' ? 'wall' : c.target.id,
    onPointerDown: stop,
    onPointerUp: stop,
    onClick: stop,
    onDoubleClick: stop,
  };
  const targetName = c.target.kind === 'wall' ? 'Wand' : c.target.name;

  if (c.conflict) {
    return (
      <span className={`${styles.label} ${styles.conflict}`} title={`Überschneidung mit ${targetName}`} {...common}>
        Überschneidung
      </span>
    );
  }

  if (draft !== null) {
    const submit = () => {
      const value = parseMeters(draft);
      setDraft(null);
      if (value !== null && value >= 0 && value <= 3000) onSubmit(value / 100);
    };
    return (
      <span className={styles.editor} {...common}>
        <input
          autoFocus
          value={draft}
          inputMode="decimal"
          aria-label={`Abstand zu ${targetName} in cm`}
          data-testid="clearance-input"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setDraft(null);
          }}
        />
        cm
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.label}
      title={`Abstand zu ${targetName} – klicken zum Ändern`}
      {...common}
      onClick={(event) => {
        event.stopPropagation();
        setDraft(formatNumber(Math.round(cm), 0));
      }}
    >
      {formatNumber(Math.round(cm), 0)} cm
    </button>
  );
}
