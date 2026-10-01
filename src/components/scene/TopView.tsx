import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MOUSE, TOUCH, type OrthographicCamera as OrthographicCameraImpl } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PLAN_VIEW_CONFIG } from '../../config/scene';
import { computePlanFitZoom, fitCenter, type FitShape } from '../../utils/camera';
import type { RoomModel } from '../../utils/room/model';
import { resetOrbitControls } from '../../utils/orbitControls';
import { useControlsSettle } from './useControlsSettle';
import { RoomDimensionLines } from './annotations/RoomDimensionLines';

/** Norden (-z) zeigt im Grundriss nach oben. */
const CAMERA_UP: [number, number, number] = [0, 0, -1];
const CAMERA_POSITION: [number, number, number] = [0, PLAN_VIEW_CONFIG.cameraHeight, 0];
const MOUSE_BUTTONS = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
const TOUCHES = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };

interface TopViewProps {
  active: boolean;
  room: RoomModel;
  /** Einzupassender Umriss; eingepasst wird bei Aktivierung und wenn sich `fitKey` ändert. */
  fitShape: FitShape;
  /** Neu einpassen, wenn sich dieser Schlüssel ändert (Projekt öffnen/neu, neue Raumform, Rechteckmaße). */
  fitKey: string;
  /** Zusätzliche Grundriss-Inhalte mit zoomabhängigem Maßstab (z. B. Abstandsmaße). */
  overlay?: (metersPerPixel: number) => ReactNode;
}

/**
 * 2D-Ansicht: exakte Draufsicht mit orthografischer Kamera (keine perspektivische
 * Verzerrung). Zoomen und Verschieben sind möglich, Drehen nicht. Beim Aktivieren
 * und bei Maßänderungen wird der Raum automatisch ins Sichtfeld eingepasst.
 */
export function TopView({ active, room, fitShape, fitKey, overlay }: TopViewProps) {
  const getState = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  const [camera, setCamera] = useState<OrthographicCameraImpl | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  useControlsSettle(controlsRef, active);
  // Zoom = Pixel pro Meter; steuert die zoomunabhängige Darstellung der Maßlinien.
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    if (!active || !camera) return;
    const { size } = getState();
    const fitZoom = computePlanFitZoom(fitShape, size.width, size.height);
    const center = fitCenter(fitShape);
    resetOrbitControls(controlsRef.current, () => {
      camera.position.set(center.x, CAMERA_POSITION[1], center.z);
      camera.zoom = fitZoom;
      camera.updateProjectionMatrix();
      controlsRef.current?.target.set(center.x, 0, center.z);
    });
    setZoom(fitZoom);
    invalidate();
    // Nur bei Aktivierung und neuem Schlüssel – Bearbeitungen am Grundriss lassen die Ansicht stehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, camera, getState, fitKey]);

  return (
    <>
      <OrthographicCamera
        ref={setCamera}
        makeDefault={active}
        position={CAMERA_POSITION}
        up={CAMERA_UP}
        near={PLAN_VIEW_CONFIG.near}
        far={PLAN_VIEW_CONFIG.far}
      />
      {camera && (
        <OrbitControls
          ref={controlsRef}
          camera={camera}
          // Als Standard-Steuerung registriert, damit das Ziehen von Elementen den Pan pausieren kann.
          makeDefault={active}
          enabled={active}
          enableRotate={false}
          screenSpacePanning
          zoomToCursor
          enableDamping
          dampingFactor={0.15}
          minZoom={PLAN_VIEW_CONFIG.minZoom}
          maxZoom={PLAN_VIEW_CONFIG.maxZoom}
          mouseButtons={MOUSE_BUTTONS}
          touches={TOUCHES}
          onChange={() => setZoom(camera.zoom)}
        />
      )}
      {active && <RoomDimensionLines room={room} metersPerPixel={1 / zoom} />}
      {active && overlay?.(1 / zoom)}
    </>
  );
}
