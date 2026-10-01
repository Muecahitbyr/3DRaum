import { CanvasTexture } from 'three';

let texture: CanvasTexture | null = null;

/** Weicher, radialer Verlauf (einmal erzeugt und von allen Möbeln geteilt). */
function shadowTexture(): CanvasTexture {
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  texture = new CanvasTexture(canvas);
  return texture;
}

const noRaycast = () => {};

/**
 * Dezenter Kontaktschatten unter einem Möbel: eine transparente Fläche mit weichem
 * Verlauf knapp über dem Boden. Sehr günstig (keine zusätzliche Render-Pass) und hebt
 * Möbel klar vom Boden ab – ergänzt den Schlagschatten der Hauptlichtquelle.
 */
export function ContactShadow({ width, depth, opacity = 0.32 }: { width: number; depth: number; opacity?: number }) {
  return (
    // 12 mm über dem Boden: auch auf einem Teppich (max. 10 mm hoch) sichtbar.
    <mesh name="contact-shadow" position-y={0.012} rotation-x={-Math.PI / 2} raycast={noRaycast} renderOrder={-1}>
      <planeGeometry args={[width * 1.35 + 0.12, depth * 1.35 + 0.12]} />
      <meshBasicMaterial map={shadowTexture()} color="#000000" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
