import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState } from 'react';
import { Vector3, type PerspectiveCamera as PerspectiveCameraImpl } from 'three';
import { CAMERA_CONFIG, CONTROLS_CONFIG } from '../../config/scene';
import { computeFitCameraPosition, fitCenter, type FitShape } from '../../utils/camera';
import { keepInside, PREVIEW_CAMERA, previewPose } from '../../utils/previewCamera';
import type { FloorPoint } from '../../types/room';
import type { RoomModel } from '../../utils/room/model';
import { resetOrbitControls } from '../../utils/orbitControls';


const PREVIEW_FOV = 60;
const NO_OBSTACLES: readonly (readonly FloorPoint[])[] = [];

interface PerspectiveViewProps {
  active: boolean;
  /** Umriss, auf den die Kamera eingepasst wird … */
  fitShape: FitShape;
  /** … jedes Mal, wenn sich dieses Token ändert (Start, Projekt öffnen/neu). */
  fitToken: number;
  /** Vorschau: Kamera auf Augenhöhe im Raum, begrenzt auf das Rauminnere. */
  preview?: boolean;
  room: RoomModel;
  /** Hohe Möbel (Grundflächen, Welt) – die Vorschau startet nicht direkt davor. */
  obstacles?: readonly (readonly FloorPoint[])[];
}

/**
 * 3D-Ansicht: Perspektivkamera + OrbitControls (Links: drehen, Rechts: verschieben,
 * Mausrad: zoomen). Die Startkamera wird einmalig eingepasst; spätere Maßänderungen
 * und Wechsel in die 2D-Ansicht lassen die Kamera unverändert, damit die Ansicht des
 * Nutzers erhalten bleibt.
 */
export function PerspectiveView({ active, fitShape, fitToken, preview = false, room, obstacles = NO_OBSTACLES }: PerspectiveViewProps) {
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const size = useThree((state) => state.size);
  const [camera, setCamera] = useState<PerspectiveCameraImpl | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const fittedToken = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!camera || fittedToken.current === fitToken || size.width === 0 || size.height === 0) return;
    const center = fitCenter(fitShape);
    const target = new Vector3(center.x, 0, center.z);
    const position = computeFitCameraPosition(fitShape, size.width / size.height, target);
    // Verschobenes Drehzentrum (Pan) und Restschwung einer Drehung ebenfalls zurücksetzen.
    resetOrbitControls(controlsRef.current, () => {
      camera.position.copy(position);
      camera.lookAt(target);
      controlsRef.current?.target.copy(target);
    });
    fittedToken.current = fitToken;
  }, [camera, size, fitShape, fitToken]);

  // Vorschau betreten: Bearbeitungskamera merken, auf Augenhöhe in den Raum wechseln.
  // Verlassen: gemerkte Bearbeitungskamera wiederherstellen.
  const saved = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    if (!camera) return;
    if (preview) {
      if (!saved.current) saved.current = { position: camera.position.clone(), target: controls?.target.clone() ?? new Vector3() };
      const pose = previewPose(roomRef.current, obstaclesRef.current);
      // Weiterer Blickwinkel auf Augenhöhe (Innenraum).
      camera.fov = PREVIEW_FOV;
      camera.updateProjectionMatrix();
      resetOrbitControls(controls, () => {
        camera.position.set(...pose.position);
        controls?.target.set(...pose.target);
        camera.lookAt(...pose.target);
      });
    } else if (saved.current) {
      const { position, target } = saved.current;
      saved.current = null;
      camera.fov = CAMERA_CONFIG.fov;
      camera.updateProjectionMatrix();
      resetOrbitControls(controls, () => {
        camera.position.copy(position);
        controls?.target.copy(target);
        camera.lookAt(target);
      });
    }
  }, [preview, camera]);

  // Vorschau: Kamera und Drehzentrum bleiben im Raum (keine React-Updates – direkt im Frame).
  useFrame(() => {
    if (!preview || !active || !camera) return;
    const r = roomRef.current;
    const controls = controlsRef.current;
    const H = r.dimensions.height;
    const pos = keepInside(r, { x: camera.position.x, z: camera.position.z }, PREVIEW_CAMERA.wallMargin);
    if (pos) camera.position.set(pos.x, camera.position.y, pos.z);
    camera.position.y = Math.min(Math.max(camera.position.y, PREVIEW_CAMERA.minY), H - PREVIEW_CAMERA.ceilingGap);
    if (controls) {
      const t = keepInside(r, { x: controls.target.x, z: controls.target.z }, PREVIEW_CAMERA.wallMargin);
      if (t) controls.target.set(t.x, controls.target.y, t.z);
      controls.target.y = Math.min(Math.max(controls.target.y, 0.2), H - 0.3);
    }
  });
  const extent = Math.max(room.dimensions.width, room.dimensions.length);

  return (
    <>
      <PerspectiveCamera
        ref={setCamera}
        makeDefault={active}
        fov={CAMERA_CONFIG.fov}
        near={CAMERA_CONFIG.near}
        far={CAMERA_CONFIG.far}
      />
      {camera && (
        <OrbitControls
          ref={controlsRef}
          camera={camera}
          enabled={active}
          enableDamping
          dampingFactor={0.1}
          minDistance={preview ? 0.2 : CONTROLS_CONFIG.minDistance}
          maxDistance={preview ? Math.max(2, extent) : CONTROLS_CONFIG.maxDistance}
          minPolarAngle={preview ? 0.25 : 0}
          maxPolarAngle={preview ? Math.PI * 0.62 : CONTROLS_CONFIG.maxPolarAngle}
        />
      )}
    </>
  );
}
