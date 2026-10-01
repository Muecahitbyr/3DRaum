import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { Object3D } from 'three';

export interface SceneCaptureApi {
  /** Aktuelle Ansicht ohne Hilfselemente als Bild (längste Seite ≈ `maxSize` Pixel). */
  capture: (maxSize?: number) => HTMLCanvasElement;
}

/** Hilfselemente, die nie in einen Export gehören (Auswahl, Einrasthilfen …). */
const HELPER_NAMES = ['furniture-outline', 'selection-bounds', 'snap-guide', 'selection-marquee', 'passage-outline'];
const isHelper = (o: Object3D) =>
  HELPER_NAMES.includes(o.name) || o.name.startsWith('furniture-snap-guide') || o.name.startsWith('room-snap-guide');

/**
 * Stellt dem Export den Renderer bereit. Aufnahme: Die Szene wird einmal mit höherer
 * Pixeldichte gerendert und sofort (im selben Task, daher ohne `preserveDrawingBuffer`)
 * in ein eigenes Canvas kopiert; danach wird der Ausgangszustand wiederhergestellt.
 * HTML-Overlays (Maßtexte, Griffe) sind ohnehin nicht Teil des WebGL-Bildes.
 */
export function SceneCapture({ onReady }: { onReady: (api: SceneCaptureApi | null) => void }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    onReady({
      capture: (maxSize = 3200) => {
        const { gl, scene, camera, size } = get();
        const hidden: Object3D[] = [];
        scene.traverse((o) => {
          if (o.visible && isHelper(o)) {
            o.visible = false;
            hidden.push(o);
          }
        });
        const previous = gl.getPixelRatio();
        const ratio = Math.max(1, Math.min(4, maxSize / Math.max(size.width, size.height)));
        try {
          gl.setPixelRatio(ratio);
          gl.render(scene, camera);
          const out = document.createElement('canvas');
          out.width = gl.domElement.width;
          out.height = gl.domElement.height;
          const ctx = out.getContext('2d');
          if (!ctx) throw new Error('Zeichenfläche nicht verfügbar.');
          ctx.drawImage(gl.domElement, 0, 0);
          return out;
        } finally {
          gl.setPixelRatio(previous);
          hidden.forEach((o) => (o.visible = true));
          gl.render(scene, camera);
        }
      },
    });
    return () => onReady(null);
  }, [get, onReady]);
  return null;
}
