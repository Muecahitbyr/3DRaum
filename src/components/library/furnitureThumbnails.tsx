import { createRoot, flushSync, useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { Box3, Vector3 } from 'three';
import { FURNITURE_CATALOG, FURNITURE_TYPES } from '../../config/furniture';
import type { FurnitureType } from '../../types/furniture';
import { FurnitureModel } from '../scene/furniture/FurnitureModel';

const WIDTH = 200;
const HEIGHT = 150;
/** Blickrichtung: schräg von vorne rechts oben (Vorderseite der Möbel zeigt nach +z). */
const VIEW = new Vector3(0.9, 0.75, 1.35).normalize();

const cache = new Map<FurnitureType, string>();
let running: Promise<ReadonlyMap<FurnitureType, string>> | null = null;

/** Passt die Kamera auf das Modell ein, rendert ein Bild und meldet es als Data-URL. */
function Snapshot({ type, onCapture }: { type: FurnitureType; onCapture: (url: string) => void }) {
  const { gl, scene, camera } = useThree();
  useLayoutEffect(() => {
    const box = new Box3().setFromObject(scene);
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const fov = 28;
    const distance = radius / Math.sin(((fov / 2) * Math.PI) / 180) * 1.02;
    camera.position.copy(center).addScaledVector(VIEW, distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    gl.render(scene, camera);
    onCapture(gl.domElement.toDataURL('image/png'));
  }, [type, gl, scene, camera, onCapture]);
  return null;
}

/**
 * Erzeugt einmalig Vorschaubilder aller Möbeltypen mit einem unsichtbaren
 * Renderer (eigene WebGL-Instanz, danach wieder freigegeben). Ergebnis wird
 * zwischengespeichert. Später können GLB-Modelle denselben Weg nutzen.
 */
export function renderFurnitureThumbnails(): Promise<ReadonlyMap<FurnitureType, string>> {
  if (cache.size === FURNITURE_TYPES.length) return Promise.resolve(cache);
  running ??= (async () => {
    const canvas = document.createElement('canvas');
    const root = createRoot(canvas);
    try {
      await root.configure({
        size: { width: WIDTH, height: HEIGHT, top: 0, left: 0 },
        dpr: 2,
        flat: true,
        frameloop: 'never',
        events: undefined,
        gl: { alpha: true, antialias: true, preserveDrawingBuffer: true },
        camera: { fov: 28, near: 0.01, far: 50 },
      });
      for (const type of FURNITURE_TYPES) {
        if (cache.has(type)) continue;
        const item = { ...FURNITURE_CATALOG[type].defaultSize, type };
        flushSync(() => {
          root.render(
            <>
              <hemisphereLight args={['#ffffff', '#d9d4cc', 2.2]} />
              <directionalLight position={[3, 5, 4]} intensity={1.6} />
              <group key={type}>
                <FurnitureModel item={{ ...item, id: type, name: '', position: { x: 0, z: 0 }, rotationDeg: 0 }} />
              </group>
              <Snapshot key={`s-${type}`} type={type} onCapture={(url) => cache.set(type, url)} />
            </>,
          );
        });
      }
    } finally {
      root.unmount();
      running = null;
    }
    return cache;
  })();
  return running;
}
