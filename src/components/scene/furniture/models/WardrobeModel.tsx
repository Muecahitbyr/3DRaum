import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

const DOOR_TARGET_WIDTH = 0.5;
const GAP = 0.006;
const FRONT_THICKNESS = 0.02;
/** Griffe liegen innerhalb der Außentiefe, damit die Bounding Box exakt bleibt. */
const HANDLE_DEPTH = 0.016;

/** Schrank: Korpus mit Sockel, Türen an der Vorderseite (+z) mit Griffen. */
export function WardrobeModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const body = colorOf(colors, 'main', C.cabinet);
  const front = derivedOf(colors, 'main', C.cabinetFront, 0.1);
  const plinth = Math.min(0.08, h * 0.05);
  const doorCount = Math.min(8, Math.max(1, Math.round(w / DOOR_TARGET_WIDTH)));
  const doorWidth = (w - (doorCount + 1) * GAP) / doorCount;
  const doorHeight = h - plinth - 2 * GAP;
  const bodyDepth = d - FRONT_THICKNESS - HANDLE_DEPTH;
  const frontZ = d / 2 - HANDLE_DEPTH - FRONT_THICKNESS / 2;
  const handleHeight = Math.min(0.3, h * 0.15);
  const handleY = plinth + (h - plinth) * 0.5;

  return (
    <group>
      <Part position={[0, plinth + (h - plinth) / 2, -d / 2 + bodyDepth / 2]} size={[w, h - plinth, bodyDepth]} color={body} />
      <Part position={[0, plinth / 2, -d / 2 + (bodyDepth - 0.03) / 2]} size={[w - 0.04, plinth, bodyDepth - 0.03]} color={C.plinth} />
      {Array.from({ length: doorCount }, (_, i) => {
        const x = -w / 2 + GAP + doorWidth / 2 + i * (doorWidth + GAP);
        // Griffe paarweise an der Mittelfuge, bei ungerader Anzahl an der rechten Kante.
        const handleOnRight = doorCount === 1 || i % 2 === 0;
        const handleX = x + (handleOnRight ? 1 : -1) * (doorWidth / 2 - 0.04);
        return (
          <group key={i}>
            <Part position={[x, plinth + GAP + doorHeight / 2, frontZ]} size={[doorWidth, doorHeight, FRONT_THICKNESS]} color={front} roughness={0.6} />
            <Part position={[handleX, handleY, d / 2 - HANDLE_DEPTH / 2]} size={[0.015, handleHeight, HANDLE_DEPTH]} color={C.handle} roughness={0.35} />
          </group>
        );
      })}
    </group>
  );
}
