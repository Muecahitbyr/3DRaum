import { useFrame } from '@react-three/fiber';
import { useRef, useState, type RefObject } from 'react';
import { MathUtils, type Material, type Object3D } from 'three';
import { WALL_FADE_CONFIG as CFG } from '../../../config/scene';
import type { WallSegment } from '../../../types/room';

interface FadeBase {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

type FadeMaterial = Material & { opacity: number; userData: { fadeBase?: FadeBase } };

/**
 * Wie weit die Kamera außerhalb der Wand-Innenebene steht (positiv = Wand liegt
 * zwischen Kamera und Raum). Gilt für beliebig orientierte Wände: gemessen entlang
 * der Außennormalen ab der Innenfläche.
 */
function cameraDistanceOutside(wall: WallSegment, camera: { x: number; z: number }) {
  const nx = -wall.inward.x;
  const nz = -wall.inward.z;
  return (camera.x - wall.start.x) * nx + (camera.z - wall.start.z) * nz;
}

function applyToMaterial(material: FadeMaterial, factor: number) {
  if (material.colorWrite === false) return; // unsichtbare Klickflächen
  const base = (material.userData.fadeBase ??= {
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
  });
  const opacity = base.opacity * factor;
  const transparent = base.transparent || factor < 0.999;
  material.opacity = opacity;
  material.depthWrite = base.depthWrite && factor >= 0.999;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
}

/**
 * Setzt die Deckkraft aller Teile einer Wand: Wandfläche, Wandkanten und
 * Türen/Fenster jeweils mit eigener Restdeckkraft. `visibility` 1 = normal, 0 = ausgeblendet.
 * Nur in 3D (`manageShadows`) werfen Tür-/Fensterteile einer ausgeblendeten Wand keinen
 * Schatten; den Schatten der Wandfläche selbst steuert die Komponente per Prop.
 */
function applyWallVisibility(group: Object3D, bodyName: string, visibility: number, manageShadows: boolean) {
  const castsShadow = visibility >= CFG.interactiveThreshold;
  group.traverse((object) => {
    const material = (object as Object3D & { material?: FadeMaterial | FadeMaterial[] }).material;
    if (!material || Array.isArray(material)) return;
    const isBody = object.name === bodyName;
    const isBodyEdge = object.parent?.name === bodyName;
    const minimum = isBody ? CFG.wallOpacity : isBodyEdge ? CFG.edgeOpacity : CFG.openingOpacity;
    applyToMaterial(material, MathUtils.lerp(minimum, 1, visibility));
    if (manageShadows && !isBody && !isBodyEdge) {
      const shadowBase = (object.userData.castShadowBase ??= object.castShadow) as boolean;
      object.castShadow = shadowBase && castsShadow;
    }
  });
}

/**
 * Kameraabhängiges Ausblenden einer Wand in der 3D-Ansicht. Läuft pro gerendertem Frame
 * ohne React-Re-Render (Materialwerte werden direkt gesetzt); nur wenn sich die
 * Klickbarkeit ändert, wird einmal neu gerendert. Während der Überblendung werden
 * weitere Frames angefordert (Canvas rendert nur auf Anforderung).
 *
 * @returns `true`, solange die Wand sichtbar genug ist, um Klicks anzunehmen.
 */
export function useWallFade(groupRef: RefObject<Object3D | null>, wall: WallSegment, enabled: boolean): boolean {
  const visibility = useRef(1);
  const applied = useRef<number | null>(null);
  // Beim ersten 3D-Frame (Laden, Wechsel 2D → 3D) sofort den Zielzustand zeigen;
  // weich überblendet wird nur, während sich die Kamera bewegt.
  const wasEnabled = useRef(false);
  const [interactive, setInteractive] = useState(true);
  const interactiveRef = useRef(true);
  const bodyName = `wall-${wall.id}-body`;

  useFrame(({ camera, invalidate }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    let target = 1;
    if (enabled) {
      const d = cameraDistanceOutside(wall, { x: camera.position.x, z: camera.position.z });
      target = 1 - MathUtils.smoothstep(d, CFG.fadeStartDistance, CFG.fadeEndDistance);
    }
    // Grundriss: sofort voll sichtbar. 3D: beim Einstieg sofort, danach zeitlich geglättet.
    const entering = enabled && !wasEnabled.current;
    wasEnabled.current = enabled;
    let next = !enabled ? 1 : entering ? target : MathUtils.damp(visibility.current, target, CFG.smoothing, Math.min(delta, 0.1));
    if (Math.abs(next - target) < 0.002) next = target;
    // Rendern auf Anforderung: Solange die Überblendung läuft, den nächsten Frame anfordern.
    if (next !== target) invalidate();
    visibility.current = next;
    group.userData.visibility = next;

    // Nur anwenden, wenn sich etwas ändert – oder solange ausgeblendet (neu hinzugefügte Teile erfassen).
    if (applied.current !== next || next < 1) {
      applyWallVisibility(group, bodyName, next, enabled);
      applied.current = next;
    }

    const isInteractive = next >= CFG.interactiveThreshold;
    if (isInteractive !== interactiveRef.current) {
      interactiveRef.current = isInteractive;
      setInteractive(isInteractive);
    }
  });

  return interactive;
}
