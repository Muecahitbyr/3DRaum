import type { OrbitControls } from 'three-stdlib';

/**
 * Setzt Kamera/Drehzentrum hart neu (z. B. beim Einpassen) und verwirft dabei den
 * Restschwung der gedämpften OrbitControls – sonst würde eine vorherige Drehung
 * die Kamera nach dem Einpassen noch ein Stück weiterbewegen.
 */
export function resetOrbitControls(controls: OrbitControls | null, apply: () => void) {
  if (!controls) {
    apply();
    return;
  }
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update(); // ohne Dämpfung: Restbewegung wird verbraucht und auf 0 gesetzt
  apply();
  controls.update();
  controls.enableDamping = damping;
}
