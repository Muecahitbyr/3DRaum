import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import type { FurnitureType } from '../../../../types/furniture';
import { lampLightColor } from '../../../../utils/furniture';
import { colorOf } from './parts';
import type { FurnitureModelProps } from './types';

const METAL = C.metal;

/** Leuchtender Teil (Schirm/Diffusor): bei eingeschaltetem Licht selbstleuchtend in Lichtfarbe. */
function Glow({ color, props }: { color: string; props: FurnitureModelProps }) {
  const on = props.light?.on ?? false;
  const emissive = on ? lampLightColor(props.light!.temperature) : '#000000';
  const strength = on ? 0.35 + 0.35 * Math.min(props.light!.intensity, 2) : 0;
  return <meshStandardMaterial color={color} roughness={0.85} emissive={emissive} emissiveIntensity={strength} />;
}

/**
 * Lampen aus Grundformen (performant, wenige Dreiecke). Ursprung: Mitte der
 * Grundfläche an der Unterkante des Modells – Deckenleuchten werden von außen
 * so hoch gesetzt, dass ihre Oberkante die Decke berührt.
 */
export function LampModel({ type, ...props }: FurnitureModelProps & { type: FurnitureType }) {
  // Runde Leuchten: bei ungleicher Breite/Tiefe oval gestreckt – die Außenmaße stimmen exakt.
  const r = Math.min(props.width, props.depth) / 2;
  return (
    <group scale={[props.width / (2 * r), 1, props.depth / (2 * r)]}>
      <RoundLamp type={type} {...props} />
    </group>
  );
}

function RoundLamp({ type, ...props }: FurnitureModelProps & { type: FurnitureType }) {
  const { width: w, depth: d, height: h, colors } = props;
  const r = Math.min(w, d) / 2;
  switch (type) {
    case 'ceiling-light': {
      const canopy = Math.min(0.03, h * 0.3);
      const diffuser = h - canopy;
      return (
        <group>
          <mesh position={[0, h - canopy / 2, 0]}>
            <cylinderGeometry args={[r * 0.55, r * 0.55, canopy, 28]} />
            <meshStandardMaterial color="#e4e4e0" roughness={0.5} />
          </mesh>
          <mesh position={[0, diffuser / 2, 0]} name="lamp-glow">
            <cylinderGeometry args={[r, r * 0.92, diffuser, 32]} />
            <Glow color={colorOf(colors, 'main', '#f7f5f0')} props={props} />
          </mesh>
        </group>
      );
    }
    case 'pendant-light': {
      const shadeH = Math.min(0.32, h * 0.4);
      const cord = h - shadeH;
      return (
        <group>
          <mesh position={[0, h - 0.01, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
            <meshStandardMaterial color={METAL} roughness={0.5} />
          </mesh>
          <mesh position={[0, shadeH + cord / 2, 0]}>
            <cylinderGeometry args={[0.004, 0.004, cord, 6]} />
            <meshStandardMaterial color={METAL} roughness={0.6} />
          </mesh>
          <mesh position={[0, shadeH / 2, 0]}>
            <cylinderGeometry args={[r * 0.28, r, shadeH, 32, 1, true]} />
            <meshStandardMaterial color={colorOf(colors, 'main', '#2f3237')} roughness={0.55} side={2} />
          </mesh>
          <mesh position={[0, shadeH * 0.18, 0]} name="lamp-glow">
            <sphereGeometry args={[Math.min(0.06, r * 0.35), 16, 10]} />
            <Glow color="#fffaf0" props={props} />
          </mesh>
        </group>
      );
    }
    case 'floor-lamp':
    case 'table-lamp': {
      const table = type === 'table-lamp';
      const shadeH = table ? h * 0.45 : Math.min(0.35, h * 0.24);
      const baseH = table ? h * 0.08 : 0.03;
      const pole = h - shadeH - baseH;
      return (
        <group>
          <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r * (table ? 0.55 : 0.7), r * (table ? 0.6 : 0.75), baseH, 28]} />
            <meshStandardMaterial color={METAL} roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh position={[0, baseH + pole / 2, 0]} castShadow>
            <cylinderGeometry args={[table ? 0.012 : 0.014, table ? 0.012 : 0.014, pole + shadeH * 0.4, 10]} />
            <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, h - shadeH / 2, 0]} castShadow name="lamp-glow">
            <cylinderGeometry args={[r * 0.7, r, shadeH, 32, 1, true]} />
            <Glow color={colorOf(colors, 'main', table ? '#efe7d8' : '#e3d3b6')} props={props} />
          </mesh>
        </group>
      );
    }
    default:
      return null;
  }
}
