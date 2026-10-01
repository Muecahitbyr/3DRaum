import { Line } from '@react-three/drei';
import { SCENE_COLORS } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';

/** Abstand der Auswahlumrandung vor den Wandflächen bzw. über dem Boden (vermeidet Z-Fighting). */
const LIFT = 0.004;

/**
 * 3D-Durchgang: Die Wand hat eine echte, offene Aussparung (Laibungen, Sturz) – ohne
 * Zarge oder Türblatt. Ausgewählt zeigt eine dezente Umrandung an beiden Wandflächen die Öffnung.
 */
export function PassageModel({ span, wall, selected }: OpeningPartProps) {
  if (!selected) return null;
  const y0 = span.y0 + LIFT;
  const loop = (z: number): [number, number, number][] => [
    [span.x0, y0, z],
    [span.x1, y0, z],
    [span.x1, span.y1, z],
    [span.x0, span.y1, z],
    [span.x0, y0, z],
  ];
  const face = wall.thickness / 2 + LIFT;
  return (
    <group name="passage-outline">
      {[face, -face].map((z) => (
        <Line key={z} points={loop(z)} color={SCENE_COLORS.selection} lineWidth={2} />
      ))}
    </group>
  );
}
