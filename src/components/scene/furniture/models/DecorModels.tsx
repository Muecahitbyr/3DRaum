import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { Part, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

/**
 * Teppich: flache Fläche mit dunklerer Bordüre. Bordüre und Innenfläche liegen nebeneinander
 * (nicht übereinander) – kein Z-Fighting; die Unterseite liegt auf dem Boden.
 */
export function RugModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const main = colorOf(colors, 'fabric', C.rug);
  const border = derivedOf(colors, 'fabric', '#9c8a71', -0.18);
  const b = Math.min(0.08, Math.min(w, d) * 0.08);
  const strip = (x: number, z: number, sw: number, sd: number, key: string) => (
    <mesh key={key} position={[x, h / 2, z]} receiveShadow>
      <boxGeometry args={[sw, h, sd]} />
      <meshStandardMaterial color={border} roughness={1} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, h / 2, 0]} receiveShadow name="rug-surface">
        <boxGeometry args={[w - 2 * b, h, d - 2 * b]} />
        <meshStandardMaterial color={main} roughness={1} />
      </mesh>
      {strip(0, -d / 2 + b / 2, w, b, 'n')}
      {strip(0, d / 2 - b / 2, w, b, 's')}
      {strip(-w / 2 + b / 2, 0, b, d - 2 * b, 'w')}
      {strip(w / 2 - b / 2, 0, b, d - 2 * b, 'e')}
    </group>
  );
}

/** Blätter einer Pflanze: Winkel, Höhe (Anteil), Neigung – fest, damit jedes Modell gleich aussieht. */
const LEAVES: readonly [angle: number, at: number, tilt: number][] = [
  [0.2, 0.55, 0.9], [1.4, 0.62, 0.8], [2.6, 0.58, 0.95], [3.8, 0.66, 0.85], [5.0, 0.6, 0.9],
  [0.9, 0.78, 0.6], [2.1, 0.82, 0.55], [3.3, 0.8, 0.65], [4.5, 0.84, 0.6], [5.6, 0.76, 0.6],
  [0.5, 0.95, 0.3], [2.8, 0.97, 0.25], [4.9, 0.93, 0.35],
];

/** Pflanze: konischer Topf mit Erde, Stiele und mehrere schräge, flache Blätter. */
export function PlantModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const pot = colorOf(colors, 'main', C.pot);
  const leaf = colorOf(colors, 'fabric', C.leaf);
  const leafDark = derivedOf(colors, 'fabric', '#3f6a3c', -0.15);
  const r = Math.min(w, d) / 2;
  const potH = Math.min(0.35, h * 0.3);
  const potR = r * 0.55;
  const leafLen = Math.min(r * 0.62, h * 0.3);
  return (
    <group>
      <mesh position={[0, potH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[potR, potR * 0.78, potH, 24]} />
        <meshStandardMaterial color={pot} roughness={0.7} />
      </mesh>
      <mesh position={[0, potH - 0.01, 0]}>
        <cylinderGeometry args={[potR * 0.93, potR * 0.93, 0.01, 24]} />
        <meshStandardMaterial color={C.soil} roughness={1} />
      </mesh>
      <Part position={[0, potH + (h - potH) * 0.35, 0]} size={[0.02, (h - potH) * 0.7, 0.02]} color={C.stem} />
      {LEAVES.map(([a, at, tilt], i) => {
        // Halbe Ausdehnung des schrägen Blatts: waagerecht (zur Seite) und senkrecht (nach oben).
        const side = leafLen * 0.5 * Math.cos(tilt) + leafLen * 0.08 * Math.sin(tilt);
        const up = leafLen * 0.5 * Math.sin(tilt) + leafLen * 0.08 * Math.cos(tilt);
        // Untere Blätter reichen bis an den Rand der Grundfläche, die oberen bis an die Höhe.
        const y = Math.min(potH + (h - potH) * at, h - up);
        const reach = (r - side) * (1 - (at - 0.55) * 0.6);
        return (
          <group key={i} position={[Math.cos(a) * reach, y, Math.sin(a) * reach]} rotation={[0, -a, 0]}>
            <mesh rotation={[0, 0, tilt]} scale={[leafLen * 0.5, leafLen * 0.08, leafLen * 0.22]} castShadow>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={i % 3 === 0 ? leafDark : leaf} roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
