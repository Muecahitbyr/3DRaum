import { RoundedBox } from '@react-three/drei';

type Vec3 = [number, number, number];

interface PartProps {
  position: Vec3;
  size: Vec3;
  color: string;
  roughness?: number;
  rotation?: Vec3;
}

/** Quader-Bauteil eines prozeduralen Möbelmodells. */
export function Part({ position, size, color, roughness = 0.8, rotation }: PartProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

/** Weiches Bauteil (Kissen, Polster, Matratze) mit abgerundeten Kanten. */
export function SoftPart({ position, size, color, roughness = 0.95, rotation, radius = 0.03 }: PartProps & { radius?: number }) {
  // Radius darf die halbe kleinste Kantenlänge nicht überschreiten.
  const safeRadius = Math.max(0.001, Math.min(radius, Math.min(...size) / 2 - 0.001));
  return (
    <RoundedBox args={size} radius={safeRadius} smoothness={3} position={position} rotation={rotation} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={roughness} />
    </RoundedBox>
  );
}

/** Zylinder (senkrecht), z. B. Gasdruckfeder oder Rundbein. */
export function Rod({ position, radius, height, color, roughness = 0.4 }: { position: Vec3; radius: number; height: number; color: string; roughness?: number }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 14]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={0.3} />
    </mesh>
  );
}

/** Kugel, z. B. Laufrolle. */
export function Ball({ position, radius, color }: { position: Vec3; radius: number; color: string }) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[radius, 12, 8]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

/** Farbe aufhellen (amount > 0) oder abdunkeln (amount < 0) – für abgeleitete Bauteilfarben. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount >= 0 ? 255 : 0;
  const k = Math.abs(amount);
  const ch = (v: number) => Math.round(v + (target - v) * k).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

type Colors = Partial<Record<'main' | 'wood' | 'fabric', string>> | undefined;

/** Gewählte Farbe eines Bereichs oder die bisherige Standardfarbe. */
export const colorOf = (colors: Colors, slot: 'main' | 'wood' | 'fabric', fallback: string) => colors?.[slot] ?? fallback;

/**
 * Abgeleitete Bauteilfarbe (z. B. Kissen etwas heller als der Bezug): ohne eigene Farbe
 * exakt die bisherige Standardfarbe, sonst aus der gewählten Farbe abgeleitet.
 */
export const derivedOf = (colors: Colors, slot: 'main' | 'wood' | 'fabric', fallback: string, amount: number) => {
  const chosen = colors?.[slot];
  return chosen ? shade(chosen, amount) : fallback;
};
