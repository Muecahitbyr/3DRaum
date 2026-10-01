import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Vector3, type Group, type PerspectiveCamera } from 'three';
import { SCENE_COLORS } from '../../../config/scene';
import styles from './RotationHandle.module.css';

/** Knapp über dem Boden (über Kontaktschatten und Bodentextur). */
const Y = 0.015;
const SEGMENTS = 64;
/** Mindestabstand Möbelrand ↔ Ring (m) … */
const MIN_GAP_M = 0.15;
/** … und auf dem Bildschirm (px): Der Griff samt Touch-Greifbereich liegt nie über dem Möbel. */
const MIN_GAP_PX = 36;
const worldCenter = new Vector3();

interface RotationRingProps {
  /** Halbe Diagonale des Möbels bzw. der Auswahl (m) – der Ring liegt mit Abstand darum. */
  innerRadius: number;
  /** Laufendes Drehen: Griff hervorgehoben, Winkel angezeigt. */
  rotating: boolean;
  /** Angezeigter Winkel während des Drehens (Grad). */
  angle: number;
  onStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  testId: string;
}

/**
 * Dezenter Drehgriff für „3D Bearbeiten“: ein dünner Ring auf dem Boden um das Möbel bzw. die
 * Auswahl und ein Griff (DOM, gleiche Optik wie im Grundriss, auf Touch groß genug) hinter der
 * Rückseite. Der Ringabstand wächst bei kleinem Maßstab (Smartphone, weit entfernte Kamera),
 * damit der Griff nie über dem Möbel liegt – je Frame direkt an den Objekten, ohne React-Render
 * und ohne zusätzliche Frames (Rendern auf Anforderung). Kein CAD-Gizmo; nie im Export.
 */
export function RotationRing({ innerRadius, rotating, angle, onStart, testId }: RotationRingProps) {
  const ring = useRef<Group>(null);
  const knob = useRef<Group>(null);
  const points = useMemo(
    () => Array.from({ length: SEGMENTS + 1 }, (_, i) => {
      const a = (i / SEGMENTS) * Math.PI * 2;
      return [Math.cos(a), Y, Math.sin(a)] as [number, number, number];
    }),
    [],
  );

  // Vor dem Projizieren der HTML-Griffe (Priorität −1): Radius aus dem Maßstab am Drehpunkt.
  useFrame(({ camera, size }) => {
    if (!ring.current || !knob.current) return;
    ring.current.getWorldPosition(worldCenter);
    const perspective = camera as PerspectiveCamera;
    const metersPerPixel = perspective.isPerspectiveCamera
      ? (2 * camera.position.distanceTo(worldCenter) * Math.tan((perspective.fov * Math.PI) / 360)) / Math.max(size.height, 1)
      : 1 / Math.max(camera.zoom, 1e-6);
    const radius = innerRadius + Math.max(MIN_GAP_M, MIN_GAP_PX * metersPerPixel);
    ring.current.scale.set(radius, 1, radius);
    knob.current.position.set(0, Y, -radius);
  }, -1);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Eigener React-Root: hier gestoppt, erreicht das Ereignis weder Kamera noch Szene.
    event.stopPropagation();
    event.preventDefault();
    onStart(event);
  };

  return (
    <group name="furniture-rotation-ring">
      <group ref={ring}>
        <Line points={points} color={SCENE_COLORS.selection} lineWidth={rotating ? 2 : 1.25} transparent opacity={rotating ? 0.95 : 0.6} />
      </group>
      <group ref={knob} position={[0, Y, -(innerRadius + MIN_GAP_M)]}>
        <Html zIndexRange={[15, 0]} pointerEvents="none">
          <div className={`${styles.anchor} ${rotating ? styles.active : ''}`}>
            <div
              className={styles.knob}
              onPointerDown={handlePointerDown}
              data-testid={testId}
              role="slider"
              aria-label="Drehen"
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={Math.round(angle)}
              title="Ziehen zum Drehen"
            />
            {rotating && (
              <div className={styles.angle} style={{ top: -14 }} data-testid="rotation-angle">
                {Math.round(angle)}°
              </div>
            )}
          </div>
        </Html>
      </group>
    </group>
  );
}

/** Grundfläche eines Möbels als dünne Linie auf dem Boden (lokales System, 3D Bearbeiten). */
export function FootprintOutline({ width, depth, color }: { width: number; depth: number; color: string }) {
  const points = useMemo(() => {
    const x = width / 2;
    const z = depth / 2;
    return [[-x, Y, -z], [x, Y, -z], [x, Y, z], [-x, Y, z], [-x, Y, -z]] as [number, number, number][];
  }, [width, depth]);
  return <Line name="furniture-footprint" points={points} color={color} lineWidth={1.5} transparent opacity={0.85} />;
}
