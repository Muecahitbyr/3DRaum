import { isHexColor, normalizeHexColor } from '../config/design';
import { FURNITURE_CATALOG, isCeilingMounted, LAMP_INTENSITY, LAMP_TEMPERATURE } from '../config/furniture';
import type { FurnitureColorSlot, FurnitureItem, FurnitureType, LampLight } from '../types/furniture';
import type { FloorPoint } from '../types/room';
import { nearestPositionInRoom } from './room/containment';
import type { RoomModel } from './room/model';
import { clamp, roundToPrecision } from './units';

const fit = (value: number, min: number, max: number) => roundToPrecision(clamp(value, min, Math.max(min, max)));

export function normalizeRotation(deg: number): number {
  const rounded = Math.round(deg);
  return ((rounded % 360) + 360) % 360;
}

/** Halbe Ausdehnung der achsenparallelen Hülle des gedrehten Grundrisses (x/z). */
export function getFootprintHalfExtents({ width, depth, rotationDeg }: Pick<FurnitureItem, 'width' | 'depth' | 'rotationDeg'>) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { hx: (width * cos + depth * sin) / 2, hz: (width * sin + depth * cos) / 2 };
}

// Auf ganze Zentimeter nach innen runden (Toleranz gegen Gleitkomma-Rauschen).
const ceilCm = (v: number) => Math.ceil(v * 100 - 1e-6) / 100;
const floorCm = (v: number) => Math.floor(v * 100 + 1e-6) / 100;

/**
 * Zulässiger Bereich des Mittelpunkts entlang einer Achse innerhalb der Umriss-Hülle.
 * Ist das Möbel größer als der Raum, wird es mittig gesetzt.
 */
function centerRange(halfExtent: number, lo: number, hi: number) {
  if (2 * halfExtent >= hi - lo) return { min: (lo + hi) / 2, max: (lo + hi) / 2 };
  return { min: ceilCm(lo + halfExtent), max: floorCm(hi - halfExtent) };
}

/**
 * Zulässige Wertebereiche. Die Höhe ist zusätzlich durch die Raumhöhe begrenzt.
 * `x`/`z`: Bereich innerhalb der Umriss-Hülle (Eingabefelder, Einrasten); ob eine
 * Position in einer L-/freien Form wirklich zulässig ist, entscheidet `normalizeFurniture`.
 */
export function getFurnitureLimits(item: Pick<FurnitureItem, 'type' | 'width' | 'depth' | 'rotationDeg'>, room: RoomModel) {
  const { limits } = FURNITURE_CATALOG[item.type];
  const { hx, hz } = getFootprintHalfExtents(item);
  const { bounds, dimensions } = room;
  // Deckenleuchten hängen von der Decke – mindestens 30 cm Luft bis zum Boden.
  const heightCap = isCeilingMounted(item.type) ? dimensions.height - 0.3 : dimensions.height;
  return {
    width: { min: limits.width[0], max: limits.width[1] },
    depth: { min: limits.depth[0], max: limits.depth[1] },
    height: { min: Math.min(limits.height[0], heightCap), max: Math.min(limits.height[1], heightCap) },
    x: centerRange(hx, bounds.minX, bounds.maxX),
    z: centerRange(hz, bounds.minZ, bounds.maxZ),
  };
}

/**
 * Hält alle Werte gültig: Maße im Katalogbereich (auf cm gerundet), Rotation in
 * [0, 360) und die Position so, dass der gedrehte Grundriss in der tatsächlichen
 * Raumkontur liegt (nächste zulässige Position). Kollisionen mit anderen Möbeln
 * werden nur gemeldet, nicht verhindert.
 */
export function normalizeFurniture(item: FurnitureItem, room: RoomModel): FurnitureItem {
  const sizeLimits = getFurnitureLimits(item, room);
  const sized = {
    ...item,
    // Nicht am Ende kürzen: Namen werden live getippt („Sofa “ → „Sofa groß“).
    name: item.name.trim() ? item.name.trimStart() : FURNITURE_CATALOG[item.type].label,
    width: fit(item.width, sizeLimits.width.min, sizeLimits.width.max),
    depth: fit(item.depth, sizeLimits.depth.min, sizeLimits.depth.max),
    height: fit(item.height, sizeLimits.height.min, sizeLimits.height.max),
    rotationDeg: normalizeRotation(item.rotationDeg),
  };
  const extras = normalizeExtras(sized, room.dimensions.height);
  const position = nearestPositionInRoom(room, sized, item.position);
  const unchanged =
    position.x === item.position.x &&
    position.z === item.position.z &&
    sized.width === item.width &&
    sized.depth === item.depth &&
    sized.height === item.height &&
    sized.rotationDeg === item.rotationDeg &&
    sized.name === item.name &&
    extras === null;
  if (unchanged) return item;
  return { ...sized, ...(extras ?? {}), position };
}

/**
 * Farben, Licht und Standhöhe gültig halten. `null` = nichts zu ändern.
 * Ungültige Farben entfallen (Standardfarbe), Licht wird begrenzt bzw. ergänzt.
 */
function normalizeExtras(item: FurnitureItem, roomHeight: number): Partial<FurnitureItem> | null {
  const definition = FURNITURE_CATALOG[item.type];
  const patch: Partial<FurnitureItem> = {};
  let changed = false;

  if (item.colors) {
    const allowed = new Set((definition.colorSlots ?? []).map((s) => s.slot));
    const colors: Partial<Record<FurnitureColorSlot, string>> = {};
    for (const [slot, value] of Object.entries(item.colors) as [FurnitureColorSlot, string][]) {
      if (allowed.has(slot) && isHexColor(value)) colors[slot] = normalizeHexColor(value);
    }
    const same = Object.keys(colors).length === Object.keys(item.colors).length && Object.entries(colors).every(([k, v]) => item.colors![k as FurnitureColorSlot] === v);
    if (!same) {
      changed = true;
      patch.colors = Object.keys(colors).length ? colors : undefined;
    }
  }

  if (definition.lamp) {
    const light = normalizeLight(item.light ?? definition.lamp.light);
    if (!item.light || light !== item.light) {
      changed = true;
      patch.light = light;
    }
  } else if (item.light) {
    changed = true;
    patch.light = undefined;
  }

  if (definition.elevation) {
    const [lo, hi] = definition.elevation.limits;
    const value = fit(item.elevation ?? definition.elevation.default, lo, Math.min(hi, roomHeight - item.height));
    if (value !== item.elevation) {
      changed = true;
      patch.elevation = value;
    }
  } else if (item.elevation !== undefined) {
    changed = true;
    patch.elevation = undefined;
  }
  return changed ? patch : null;
}

function normalizeLight(light: LampLight): LampLight {
  const intensity = Math.round(clamp(Number.isFinite(light.intensity) ? light.intensity : 1, LAMP_INTENSITY.min, LAMP_INTENSITY.max) * 100) / 100;
  const temperature = Math.round(clamp(Number.isFinite(light.temperature) ? light.temperature : 2700, LAMP_TEMPERATURE.min, LAMP_TEMPERATURE.max));
  const on = light.on !== false;
  return intensity === light.intensity && temperature === light.temperature && on === light.on ? light : { on, intensity, temperature };
}

/** Farbe eines Farbbereichs (abweichend oder Standard des Typs). */
export function furnitureColor(item: Pick<FurnitureItem, 'type' | 'colors'>, slot: FurnitureColorSlot): string | undefined {
  const definition = FURNITURE_CATALOG[item.type].colorSlots?.find((s) => s.slot === slot);
  if (!definition) return undefined;
  return item.colors?.[slot] ?? definition.default;
}

/**
 * Unterkante über dem Boden: Deckenleuchten hängen von der Decke, Tischlampen stehen erhöht –
 * auf einem Träger (`supportY`, siehe utils/furnitureSupport.ts) automatisch auf dessen Oberseite.
 */
export function furnitureBaseY(item: Pick<FurnitureItem, 'type' | 'height' | 'elevation'>, roomHeight: number, supportY?: number): number {
  if (isCeilingMounted(item.type)) return roomHeight - item.height;
  if (supportY !== undefined && FURNITURE_CATALOG[item.type].elevation) return supportY;
  return item.elevation ?? 0;
}

/**
 * Lichtfarbe einer Lampe: Farbtemperatur, zur Hälfte mit Weiß gemischt – wie warmes
 * Licht auf dem Bildschirm wirkt, ohne Wände und Möbel orange zu färben.
 */
export function lampLightColor(kelvin: number): string {
  const n = parseInt(kelvinToHex(kelvin).slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.5).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** Farbtemperatur (Kelvin) → RGB-Hex (Näherung nach Tanner Helland). */
export function kelvinToHex(kelvin: number): string {
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const hex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Neues Möbelstück mit Standardmaßen, mittig im Raum. */
export function createFurniture(
  type: FurnitureType,
  id: string,
  existing: readonly FurnitureItem[],
  room: RoomModel,
): FurnitureItem {
  const definition = FURNITURE_CATALOG[type];
  const number = existing.filter((f) => f.type === type).length + 1;
  return normalizeFurniture(
    {
      id,
      type,
      name: `${definition.label} ${number}`,
      ...definition.defaultSize,
      position: { x: (room.bounds.minX + room.bounds.maxX) / 2, z: (room.bounds.minZ + room.bounds.maxZ) / 2 },
      rotationDeg: 0,
      ...(definition.lamp ? { light: definition.lamp.light } : {}),
      ...(definition.elevation ? { elevation: definition.elevation.default } : {}),
    },
    room,
  );
}

/** Grundriss-Position → Weltkoordinaten (Grundriss − Ursprung des Raums). */
export function furnitureToWorld(position: FloorPoint, { origin }: { origin: FloorPoint }): FloorPoint {
  return { x: position.x - origin.x, z: position.z - origin.z };
}

/** Rotation für Three.js (gegen den Uhrzeigersinn um +y). */
export function furnitureRotationY(rotationDeg: number): number {
  return -(rotationDeg * Math.PI) / 180;
}
