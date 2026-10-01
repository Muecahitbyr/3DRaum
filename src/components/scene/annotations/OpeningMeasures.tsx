import { Html, Line } from '@react-three/drei';
import { useState, type SyntheticEvent } from 'react';
import { PLAN_SYMBOL_CONFIG, SCENE_COLORS } from '../../../config/scene';
import type { Opening } from '../../../types/opening';
import type { FloorPoint, Meters } from '../../../types/room';
import { offsetForReadingDistance, readingDistances, readingSides, type ReadingSides } from '../../../utils/room/measurements';
import { wallPoint, type RoomModel } from '../../../utils/room/model';
import { formatNumber, parseMeters } from '../../../utils/units';
// Gleiches Erscheinungsbild wie die Abstandsmaße der Möbel (Auswahlmaße sind überall gleich).
import styles from '../furniture/clearance/FurnitureClearances.module.css';

type P3 = [number, number, number];

/** Abstand der Maßlinie von der Wand-Innenfläche ins Rauminnere (Pixel). */
const INSET_PX = 18;
const ARROW_PX = 7;
const TICK_PX = 5;
/** Geschätzte Etikettgröße: je Zeichen plus Innenabstand (11 px, „80 cm“), Höhe 20 px. */
const CHAR_PX = 6.6;
const LABEL_PADDING_PX = 18;
const LABEL_HEIGHT_PX = 20;
/** Luft zwischen Etikett und Maßlinie bzw. Begrenzung. */
const LABEL_AIR_PX = 8;
const HTML_PASS_THROUGH = { pointerEvents: 'none' } as const;

interface OpeningMeasuresProps {
  opening: Opening;
  room: RoomModel;
  metersPerPixel: number;
  /** Neue Position (ab Wandanfang) – Begrenzung und Verlauf übernimmt der Reducer. */
  onMove: (id: string, offset: Meters) => void;
}

/**
 * Lagemaße der ausgewählten Tür/des Fensters/Durchgangs im Grundriss: Abstand zu beiden
 * Wandecken in Grundriss-Leserichtung, entlang der tatsächlichen (auch schrägen) Wand, im
 * Rauminneren und blau wie alle Auswahlmaße. Ein Klick auf die Zahl erlaubt die exakte
 * Eingabe in cm; intern bleibt es bei einer Position ab Wandanfang.
 */
export function OpeningMeasures({ opening, room, metersPerPixel, onMove }: OpeningMeasuresProps) {
  const wall = room.wallById.get(opening.wall);
  if (!wall) return null;
  const sides = readingSides(wall);
  const distances = readingDistances(wall, opening);
  const y = room.dimensions.height + PLAN_SYMBOL_CONFIG.lineElevation + 0.02;
  // Leserichtung → Lage entlang der Wand (ab Wandanfang).
  const along = (reading: Meters) => (wall.readingReversed ? wall.length - reading : reading);
  const at = (reading: Meters, intoPx: number): FloorPoint => wallPoint(wall, along(reading), intoPx * metersPerPixel);
  const toP3 = (p: FloorPoint): P3 => [p.x, y, p.z];
  // Etiketten stehen immer waagerecht (wie bei den Möbeln): Platzbedarf entlang bzw. quer zur Wand.
  const cos = Math.abs(wall.axis.x);
  const sin = Math.abs(wall.axis.z);
  const measures: { side: keyof ReadingSides; from: Meters; to: Meters }[] = [
    { side: 'start', from: 0, to: distances.start },
    { side: 'end', from: distances.start + opening.width, to: wall.length },
  ];

  return (
    <group name="opening-measures">
      {measures.map(({ side, from, to }) => {
        const length = Math.max(0, to - from);
        const lengthPx = length / metersPerPixel;
        const cm = Math.max(0, distances[side]) * 100;
        const text = `${formatNumber(Math.round(cm), 0)} cm`;
        const labelWidth = text.length * CHAR_PX + LABEL_PADDING_PX;
        const fits = lengthPx >= cos * labelWidth + sin * LABEL_HEIGHT_PX + LABEL_AIR_PX;
        // Passt die Zahl nicht zwischen Ecke und Öffnung, steht sie weiter im Raum neben der Linie.
        const lanePx = INSET_PX + (sin * labelWidth + cos * LABEL_HEIGHT_PX) / 2 + LABEL_AIR_PX;
        const lines: P3[][] = [];
        if (lengthPx >= 1) {
          lines.push([toP3(at(from, INSET_PX)), toP3(at(to, INSET_PX))]);
          const arrowPx = Math.min(ARROW_PX, lengthPx / 2);
          for (const [tip, dir] of [[from, 1], [to, -1]] as const) {
            const back = tip + dir * arrowPx * metersPerPixel;
            lines.push([toP3(at(back, INSET_PX + arrowPx * 0.45)), toP3(at(tip, INSET_PX)), toP3(at(back, INSET_PX - arrowPx * 0.45))]);
            lines.push([toP3(at(tip, INSET_PX - TICK_PX)), toP3(at(tip, INSET_PX + TICK_PX))]);
          }
        }
        const mid = (from + to) / 2;
        return (
          <group key={side} name={`opening-measure-${side}`}>
            {lines.map((points, i) => (
              <Line key={i} points={points} color={SCENE_COLORS.selection} lineWidth={i === 0 ? 1.2 : 1.1} />
            ))}
            <Html position={toP3(at(mid, fits ? INSET_PX : lanePx))} center zIndexRange={[12, 0]} style={HTML_PASS_THROUGH}>
              <MeasureLabel
                testId={`opening-measure-${side}`}
                cm={cm}
                text={text}
                sideName={sides[side]}
                onSubmit={(meters) => onMove(opening.id, offsetForReadingDistance(wall, opening.width, side, meters))}
              />
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/** Verhindert, dass Klicks auf das Etikett die Kamera pannen oder die Auswahl aufheben. */
const stop = (event: SyntheticEvent) => event.stopPropagation();

interface MeasureLabelProps {
  testId: string;
  cm: number;
  text: string;
  /** „links“, „rechts“, „oben“, „unten“. */
  sideName: string;
  onSubmit: (meters: Meters) => void;
}

function MeasureLabel({ testId, cm, text, sideName, onSubmit }: MeasureLabelProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const common = {
    'data-testid': testId,
    'data-distance-cm': cm.toFixed(2),
    'data-side': sideName,
    onPointerDown: stop,
    onPointerUp: stop,
    onClick: stop,
    onDoubleClick: stop,
  };

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
          aria-label={`Abstand von ${sideName} in cm`}
          data-testid="opening-measure-input"
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
      title={`Abstand von ${sideName} – klicken zum Ändern`}
      aria-label={`Abstand von ${sideName}: ${text} – ändern`}
      {...common}
      onClick={(event) => {
        event.stopPropagation();
        setDraft(formatNumber(Math.round(cm), 0));
      }}
    >
      {text}
    </button>
  );
}
