import { OPENING_MODEL_CONFIG } from '../../../../config/openings';
import { SCENE_COLORS } from '../../../../config/scene';
import type { OpeningPartProps } from './OpeningElement';

/**
 * 3D-Tür: Zarge in der Wandöffnung und ein um 90° geöffnetes Türblatt an der
 * Bandseite – je nach Öffnungsrichtung ins Rauminnere oder nach außen.
 * Die Öffnung selbst bleibt frei.
 */
export function DoorModel({ span, wall, selected }: OpeningPartProps) {
  const { frameWidth: fw, doorFrameOverhang, doorLeafThickness: leafT } = OPENING_MODEL_CONFIG;
  const width = span.x1 - span.x0;
  const height = span.y1 - span.y0;
  const depth = wall.thickness + 2 * doorFrameOverhang;
  const frameColor = selected ? SCENE_COLORS.selection : SCENE_COLORS.doorFrame;

  const clearWidth = width - 2 * fw;
  const leafHeight = height - fw;
  const towardsStrike = Math.sign(span.strikeX - span.hingeX);
  const leafX = span.hingeX + towardsStrike * (fw + leafT / 2);

  return (
    <group>
      <mesh position={[span.x0 + fw / 2, height / 2, 0]} castShadow>
        <boxGeometry args={[fw, height, depth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      <mesh position={[span.x1 - fw / 2, height / 2, 0]} castShadow>
        <boxGeometry args={[fw, height, depth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      <mesh position={[(span.x0 + span.x1) / 2, height - fw / 2, 0]} castShadow>
        <boxGeometry args={[width, fw, depth]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      {clearWidth > 0 && (
        <mesh name="door-leaf" position={[leafX, leafHeight / 2, span.swingSign * (wall.thickness / 2 + clearWidth / 2)]} castShadow>
          <boxGeometry args={[leafT, leafHeight, clearWidth]} />
          <meshStandardMaterial color={selected ? SCENE_COLORS.selectionSoft : SCENE_COLORS.doorLeaf} roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}
