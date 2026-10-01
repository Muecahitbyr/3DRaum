import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { bathtubGeometry } from '../../../../config/furnitureGeometry';
import { Part, Rod, SoftPart, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

type Vec3 = [number, number, number];

/** Liegender elliptischer Zylinder (z. B. WC-Becken, Waschbecken-Mulde). */
function Oval({ position, rx, rz, height, color, roughness = 0.25 }: { position: Vec3; rx: number; rz: number; height: number; color: string; roughness?: number }) {
  return (
    <mesh position={position} scale={[rx, 1, rz]} castShadow receiveShadow>
      <cylinderGeometry args={[1, 1, height, 32]} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/**
 * Prozedurale Badobjekte (Vorderseite +z, Wandseite −z). Keramik hell und glatt,
 * Armaturen verchromt; alle Teile bleiben innerhalb der Außenmaße.
 */

/** WC: Spülkasten an der Wand, Sockel, ovales Becken mit Sitz und Deckel. */
export function ToiletModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const ceramic = colorOf(colors, 'main', C.ceramic);
  const shadeC = derivedOf(colors, 'main', C.ceramicShade, -0.08);
  const tankD = Math.min(0.18, d * 0.26);
  const seatY = Math.min(0.42, h * 0.52);
  const bowlD = d - tankD;
  const bowlZ = -d / 2 + tankD + bowlD / 2;
  return (
    <group>
      <SoftPart position={[0, (seatY - 0.05 + h) / 2, -d / 2 + tankD / 2]} size={[w, h - seatY + 0.05, tankD]} color={ceramic} radius={0.025} roughness={0.25} />
      <Part position={[0, h - 0.008, -d / 2 + tankD / 2]} size={[0.06, 0.016, 0.04]} color={C.chrome} roughness={0.2} />
      <Oval position={[0, (seatY - 0.06) / 2, bowlZ - 0.03]} rx={w * 0.3} rz={bowlD * 0.32} height={seatY - 0.06} color={shadeC} />
      <Oval position={[0, seatY - 0.06, bowlZ]} rx={w / 2} rz={bowlD / 2} height={0.1} color={ceramic} />
      <Oval position={[0, seatY - 0.0, bowlZ]} rx={w / 2 - 0.015} rz={bowlD / 2 - 0.015} height={0.025} color={ceramic} roughness={0.35} />
    </group>
  );
}

/** Waschtisch: Unterschrank (Holz), Keramikplatte mit Mulde, Einhebelmischer. */
export function WashbasinModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const ceramic = colorOf(colors, 'main', C.ceramic);
  const wood = colorOf(colors, 'wood', C.oak);
  const top = 0.06;
  const cabinetH = Math.min(0.5, h - top - 0.15);
  const cabinetY = h - top - cabinetH;
  return (
    <group>
      <Part position={[0, cabinetY + cabinetH / 2, -0.01]} size={[w - 0.02, cabinetH, d - 0.04]} color={wood} />
      <Part position={[0, cabinetY + cabinetH - 0.06, d / 2 - 0.035]} size={[Math.min(0.3, w * 0.4), 0.012, 0.012]} color={C.handle} roughness={0.3} />
      <SoftPart position={[0, h - top / 2, 0]} size={[w, top, d]} color={ceramic} radius={0.015} roughness={0.2} />
      <Oval position={[0, h - 0.002, 0.03]} rx={Math.min(0.24, w * 0.32)} rz={Math.min(0.15, d * 0.3)} height={0.004} color={C.ceramicShade} roughness={0.2} />
      <Rod position={[0, h - 0.004, 0.03]} radius={0.015} height={0.006} color={C.metal} />
      {/* Einhebelmischer: ragt wie in echt über die Waschtischplatte */}
      <Rod position={[0, h + 0.07, -d / 2 + 0.07]} radius={0.016} height={0.14} color={C.chrome} />
      <Part position={[0, h + 0.13, -d / 2 + 0.12]} size={[0.022, 0.02, 0.1]} color={C.chrome} roughness={0.2} />
    </group>
  );
}

/** Dusche: flache Duschtasse, Glaswände vorn und rechts (Ecke), Brausestange an der Wand. */
export function ShowerModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const tray = colorOf(colors, 'main', C.ceramic);
  const trayH = 0.05;
  const glassT = 0.008;
  const frame = 0.02;
  return (
    <group>
      <Part position={[0, trayH / 2, 0]} size={[w, trayH, d]} color={tray} roughness={0.3} />
      <Rod position={[0, trayH + 0.001, 0]} radius={0.04} height={0.003} color={C.steel} />
      {/* Glas vorn (+z) und rechts (+x) mit Profilen */}
      <mesh position={[0, trayH + (h - trayH) / 2, d / 2 - glassT / 2]} name="shower-glass">
        <boxGeometry args={[w - frame, h - trayH, glassT]} />
        <meshStandardMaterial color={C.showerGlass} transparent opacity={0.28} roughness={0.05} depthWrite={false} />
      </mesh>
      <mesh position={[w / 2 - glassT / 2, trayH + (h - trayH) / 2, 0]} name="shower-glass">
        <boxGeometry args={[glassT, h - trayH, d - frame]} />
        <meshStandardMaterial color={C.showerGlass} transparent opacity={0.28} roughness={0.05} depthWrite={false} />
      </mesh>
      <Part position={[w / 2 - frame / 2, trayH + (h - trayH) / 2, d / 2 - frame / 2]} size={[frame, h - trayH, frame]} color={C.chrome} roughness={0.2} />
      <Part position={[0, h - frame / 2, d / 2 - glassT / 2]} size={[w, frame, glassT + 0.004]} color={C.chrome} roughness={0.2} />
      <Part position={[w / 2 - glassT / 2, h - frame / 2, 0]} size={[glassT + 0.004, frame, d]} color={C.chrome} roughness={0.2} />
      {/* Brausestange an der Rückwand mit Kopfbrause */}
      <Rod position={[-w / 4, trayH + (h - 0.1 - trayH) / 2, -d / 2 + 0.03]} radius={0.012} height={h - 0.1 - trayH} color={C.chrome} />
      <Part position={[-w / 4, h - 0.12, -d / 2 + 0.11]} size={[0.025, 0.02, 0.16]} color={C.chrome} roughness={0.2} />
      <Rod position={[-w / 4, h - 0.135, -d / 2 + 0.19]} radius={0.09} height={0.012} color={C.chrome} />
    </group>
  );
}

/** Badewanne: Wannenrand, Innenmulde mit Boden, Einlauf am Fußende. */
export function BathtubModel({ width: w, depth: d, height: h, colors }: FurnitureModelProps) {
  const ceramic = colorOf(colors, 'main', C.ceramic);
  const inner = derivedOf(colors, 'main', C.ceramicShade, -0.06);
  const g = bathtubGeometry(w, d);
  const floorY = Math.min(0.12, h * 0.25);
  return (
    <group>
      {/* Wannenträger bis zum Mulde-Boden, darüber der Rand als vier Wände */}
      <Part position={[0, floorY / 2, 0]} size={[w, floorY, d]} color={ceramic} roughness={0.3} />
      {[-1, 1].map((s) => (
        <Part key={`z${s}`} position={[0, (floorY + h) / 2, s * (d / 2 - g.rim / 2)]} size={[w, h - floorY, g.rim]} color={ceramic} roughness={0.25} />
      ))}
      {[-1, 1].map((s) => (
        <Part key={`x${s}`} position={[s * (w / 2 - g.rim / 2), (floorY + h) / 2, 0]} size={[g.rim, h - floorY, g.innerD]} color={ceramic} roughness={0.25} />
      ))}
      <Part position={[0, floorY + 0.002, 0]} size={[g.innerW, 0.004, g.innerD]} color={inner} roughness={0.25} />
      <Rod position={[w / 2 - g.rim - 0.12, floorY + 0.006, 0]} radius={0.025} height={0.004} color={C.metal} />
      <Part position={[w / 2 - g.rim - 0.04, h - 0.03, 0]} size={[0.08, 0.025, 0.03]} color={C.chrome} roughness={0.2} />
    </group>
  );
}
