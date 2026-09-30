import { FIXTURE_COLORS } from '../../../../config/fixtures';
import { SCENE_COLORS } from '../../../../config/scene';
import type { FixtureLocalSpan } from '../../../../utils/fixtures';

export interface FixtureModelProps {
  span: FixtureLocalSpan;
  selected: boolean;
}

/** Rippenabstand des Heizkörpers (Mitte zu Mitte). */
const RIB_PITCH = 0.05;

/**
 * 3D-Heizkörper: Rückwand, senkrechte Rippen (Glieder), Abdeckung oben und ein
 * Thermostatventil – im lokalen Wandsystem vor der Wand-Innenfläche.
 */
export function RadiatorModel({ span, selected }: FixtureModelProps) {
  const width = span.x1 - span.x0;
  const height = span.y1 - span.y0;
  const depth = span.z1 - span.z0;
  const cx = (span.x0 + span.x1) / 2;
  const cy = (span.y0 + span.y1) / 2;
  const body = selected ? SCENE_COLORS.selectionSoft : FIXTURE_COLORS.radiator;
  // Auswahl dezent: Körper in hellem Blau, Rippen minimal dunkler.
  const rib = selected ? SCENE_COLORS.selectionSoft : FIXTURE_COLORS.radiatorRib;
  const ribs = Math.max(2, Math.round(width / RIB_PITCH));
  const ribWidth = (width / ribs) * 0.62;
  const panelDepth = depth * 0.35;

  return (
    <group name="radiator-model">
      <mesh position={[cx, cy, span.z0 + depth * 0.3]} castShadow receiveShadow>
        <boxGeometry args={[width, height * 0.94, panelDepth]} />
        <meshStandardMaterial color={body} roughness={0.45} />
      </mesh>
      {Array.from({ length: ribs }, (_, i) => (
        <mesh key={i} position={[span.x0 + (i + 0.5) * (width / ribs), cy, span.z0 + depth * 0.62]} castShadow>
          <boxGeometry args={[ribWidth, height, depth * 0.72]} />
          <meshStandardMaterial color={i % 2 ? rib : body} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[cx, span.y1 - 0.006, span.z0 + depth / 2]}>
        <boxGeometry args={[width, 0.012, depth]} />
        <meshStandardMaterial color={rib} roughness={0.5} />
      </mesh>
      <mesh position={[span.x1 - 0.03, span.y0 - 0.02, span.z0 + depth * 0.6]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 16]} />
        <meshStandardMaterial color={FIXTURE_COLORS.detail} roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Steckdose: Abdeckplatte mit runder Vertiefung und zwei Kontaktöffnungen. */
export function SocketModel({ span, selected }: FixtureModelProps) {
  const size = span.x1 - span.x0;
  const cx = (span.x0 + span.x1) / 2;
  const cy = (span.y0 + span.y1) / 2;
  const depth = span.z1 - span.z0;
  return (
    <group name="socket-model">
      <mesh position={[cx, cy, span.z0 + depth / 2]} castShadow>
        <boxGeometry args={[size, span.y1 - span.y0, depth]} />
        <meshStandardMaterial color={selected ? SCENE_COLORS.selectionSoft : FIXTURE_COLORS.plate} roughness={0.35} />
      </mesh>
      <mesh position={[cx, cy, span.z1 + 0.0005]}>
        <circleGeometry args={[size * 0.3, 24]} />
        <meshStandardMaterial color={FIXTURE_COLORS.radiatorRib} roughness={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[cx + side * size * 0.1, cy, span.z1 + 0.001]}>
          <circleGeometry args={[size * 0.035, 12]} />
          <meshStandardMaterial color={FIXTURE_COLORS.detail} />
        </mesh>
      ))}
    </group>
  );
}

/** Lichtschalter: Abdeckplatte mit Wippe. */
export function SwitchModel({ span, selected }: FixtureModelProps) {
  const size = span.x1 - span.x0;
  const cx = (span.x0 + span.x1) / 2;
  const cy = (span.y0 + span.y1) / 2;
  const depth = span.z1 - span.z0;
  return (
    <group name="switch-model">
      <mesh position={[cx, cy, span.z0 + depth / 2]} castShadow>
        <boxGeometry args={[size, span.y1 - span.y0, depth]} />
        <meshStandardMaterial color={selected ? SCENE_COLORS.selectionSoft : FIXTURE_COLORS.plate} roughness={0.35} />
      </mesh>
      <mesh position={[cx, cy, span.z1 + 0.003]}>
        <boxGeometry args={[size * 0.55, size * 0.55, 0.006]} />
        <meshStandardMaterial color={selected ? SCENE_COLORS.selection : FIXTURE_COLORS.radiator} roughness={0.3} />
      </mesh>
    </group>
  );
}
