import { useFrame } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import { Quaternion, Vector3, type Camera } from 'three';
import type { OrbitControls } from 'three-stdlib';

/**
 * Bewegung pro Frame in Bildschirmpixeln, unter der die Dämpfung als ausgeklungen gilt.
 * Der danach verbrauchte Rest (bei Dämpfung 0,1 höchstens das Zehnfache) bleibt unter
 * 0,2 Pixeln und ist damit unsichtbar.
 */
const REST_PX = 0.02;

/** Pixel je Meter (Verschiebung in Zielentfernung) bzw. je Radiant (Drehung). */
function pixelScale(camera: Camera, viewportHeight: number, distance: number) {
  const perspective = camera as Camera & { isPerspectiveCamera?: boolean; fov?: number; zoom?: number };
  if (perspective.isPerspectiveCamera && perspective.fov) {
    const perRadian = viewportHeight / (2 * Math.tan(((perspective.fov * Math.PI) / 180) / 2));
    return { perMeter: perRadian / Math.max(distance, 1e-3), perRadian };
  }
  // Orthografisch: Zoom = Pixel pro Meter.
  const perMeter = perspective.zoom ?? 1;
  return { perMeter, perRadian: perMeter * distance };
}

/**
 * Rendern auf Anforderung + gedämpfte OrbitControls: Die Controls melden eine Änderung nur,
 * solange die Bewegung seit der letzten Meldung eine feste Schwelle überschreitet – der
 * letzte, winzige Rest der Dämpfung bliebe sonst ungerendert stehen und würde erst beim
 * nächsten beliebigen Frame nachgeholt. Dieser Hook läuft nach dem Controls-Update:
 * Solange sich das Bild sichtbar bewegt, wird der nächste Frame angefordert; ist die
 * Bewegung unter einem Bruchteil eines Pixels, wird der Rest verbraucht und die Szene ruht.
 */
export function useControlsSettle(controlsRef: RefObject<OrbitControls | null>, active: boolean) {
  const last = useRef({ position: new Vector3(), quaternion: new Quaternion(), zoom: 1, valid: false });
  useFrame(({ camera, size, invalidate }) => {
    const controls = controlsRef.current;
    const state = last.current;
    if (!active || !controls || !controls.enabled) {
      state.valid = false;
      return;
    }
    const scale = pixelScale(camera, size.height, camera.position.distanceTo(controls.target));
    const angle = 2 * Math.acos(Math.min(1, Math.abs(camera.quaternion.dot(state.quaternion))));
    const movedPx = Math.max(camera.position.distanceTo(state.position) * scale.perMeter, angle * scale.perRadian);
    const moved = !state.valid || camera.zoom !== state.zoom || movedPx > REST_PX;
    const wasValid = state.valid;
    state.position.copy(camera.position);
    state.quaternion.copy(camera.quaternion);
    state.zoom = camera.zoom;
    state.valid = true;
    if (moved) {
      invalidate();
      return;
    }
    if (!wasValid || !controls.enableDamping) return;
    // Ausgeklungen: Restschwung ohne Dämpfung verbrauchen (endgültige Lage in diesem Frame).
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    state.position.copy(camera.position);
    state.quaternion.copy(camera.quaternion);
  });
}
