import { useLayoutEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import { LIGHTING_PRESETS } from '../../config/design';
import type { LightingSettings } from '../../types/design';
import type { Bounds } from '../../utils/polygon';

interface SceneLightsProps {
  lighting: LightingSettings;
  /** Hülle des Raums (Welt) – Sonne und Schattenkamera richten sich danach aus. */
  bounds: Bounds;
}

/**
 * Grundbeleuchtung nach Lichtstimmung: weiches Umgebungslicht (Himmel/Boden, keine
 * schwarzen Bereiche) plus ein Hauptlicht mit dezentem, performantem Schatten (eine
 * Schattenquelle, Schattenkamera eng um den Raum). „Neutral“ bei Helligkeit 1 entspricht
 * exakt der bisherigen festen Beleuchtung.
 */
export function SceneLights({ lighting, bounds }: SceneLightsProps) {
  const preset = LIGHTING_PRESETS[lighting.preset];
  const k = lighting.brightness;
  const sun = useRef<DirectionalLight>(null);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const half = Math.max(6, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 3);
  const [px, py, pz] = preset.sunPosition;

  useLayoutEffect(() => {
    const light = sun.current;
    if (!light) return;
    light.target.position.set(cx, 0, cz);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }, [cx, cz, half]);

  return (
    <>
      <hemisphereLight name="ambient-light" args={[preset.sky, preset.ground, preset.ambient * k]} />
      <directionalLight
        ref={sun}
        name="sun-light"
        position={[cx + px, py, cz + pz]}
        color={preset.sun}
        intensity={preset.sunIntensity * k}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
    </>
  );
}
