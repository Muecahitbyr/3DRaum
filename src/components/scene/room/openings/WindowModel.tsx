import { OPENING_MODEL_CONFIG } from '../../../../config/openings';
import { SCENE_COLORS } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';

/** 3D-Fenster: Rahmen mittig in der Laibung, transparente Verglasung, bei zwei Flügeln mit Mittelpfosten. */
export function WindowModel({ span, selected, sashes = 1 }: OpeningPartProps & { sashes?: 1 | 2 }) {
  const { frameWidth: fw, windowFrameDepth: depth, glassThickness } = OPENING_MODEL_CONFIG;
  const width = span.x1 - span.x0;
  const height = span.y1 - span.y0;
  const centerX = (span.x0 + span.x1) / 2;
  const centerY = (span.y0 + span.y1) / 2;
  const frameColor = selected ? SCENE_COLORS.selection : SCENE_COLORS.windowFrame;

  const bars: { position: [number, number, number]; size: [number, number, number] }[] = [
    { position: [span.x0 + fw / 2, centerY, 0], size: [fw, height, depth] },
    { position: [span.x1 - fw / 2, centerY, 0], size: [fw, height, depth] },
    { position: [centerX, span.y1 - fw / 2, 0], size: [width - 2 * fw, fw, depth] },
    { position: [centerX, span.y0 + fw / 2, 0], size: [width - 2 * fw, fw, depth] },
  ];
  if (sashes === 2) bars.push({ position: [centerX, centerY, 0], size: [fw * 1.2, height - 2 * fw, depth] });

  return (
    <group>
      {bars.map(({ position, size }, i) => (
        <mesh key={i} position={position} castShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={frameColor} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[centerX, centerY, 0]} name="window-glass">
        <boxGeometry args={[width - 2 * fw, height - 2 * fw, glassThickness]} />
        <meshStandardMaterial
          color={SCENE_COLORS.glass}
          transparent
          opacity={0.25}
          roughness={0.05}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
