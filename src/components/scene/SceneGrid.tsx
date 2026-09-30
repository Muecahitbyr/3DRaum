import { Grid } from '@react-three/drei';
import { GRID_CONFIG, SCENE_COLORS } from '../../config/scene';

/** Unendliches Orientierungsraster; knapp über dem Boden, um Z-Fighting zu vermeiden. */
export function SceneGrid() {
  return (
    <Grid
      position={[0, 0.002, 0]}
      infiniteGrid
      cellSize={GRID_CONFIG.cellSize}
      sectionSize={GRID_CONFIG.sectionSize}
      cellThickness={0.6}
      sectionThickness={1}
      cellColor={SCENE_COLORS.gridCell}
      sectionColor={SCENE_COLORS.gridSection}
      fadeDistance={GRID_CONFIG.fadeDistance}
      fadeStrength={1.5}
    />
  );
}
