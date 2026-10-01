import { useMemo } from 'react';
import { FURNITURE_CATALOG } from '../../config/furniture';
import type { FurnitureItem } from '../../types/furniture';
import { furnitureBaseY, furnitureToWorld, lampLightColor } from '../../utils/furniture';
import { supportElevations } from '../../utils/furnitureSupport';
import type { RoomModel } from '../../utils/room/model';

/** Höchstens so viele Lichtquellen gleichzeitig (Leistung): die hellsten Lampen gewinnen. */
export const MAX_LAMP_LIGHTS = 8;

/**
 * Licht der Lampen als fester Vorrat an Punktlichtern ohne Schatten. Die Anzahl
 * richtet sich nur grob nach der Zahl der Lampen (0 / 2 / 4 / 8), damit Ein-/Ausschalten
 * oder Verschieben keine Shader neu übersetzt; ungenutzte Lichter haben Stärke 0.
 * Keine Aktualisierung pro Frame – nur bei Planänderungen.
 */
export function LampLights({ furniture, room, enabled }: { furniture: readonly FurnitureItem[]; room: RoomModel; enabled: boolean }) {
  const lamps = useMemo(() => furniture.filter((f) => FURNITURE_CATALOG[f.type].lamp), [furniture]);
  const slots = lamps.length === 0 ? 0 : lamps.length <= 2 ? 2 : lamps.length <= 4 ? 4 : MAX_LAMP_LIGHTS;
  const active = useMemo(() => {
    const H = room.dimensions.height;
    const support = supportElevations(furniture, H);
    return lamps
      .filter((f) => f.light?.on)
      .map((f) => {
        const lamp = FURNITURE_CATALOG[f.type].lamp!;
        const world = furnitureToWorld(f.position, room);
        return {
          id: f.id,
          position: [world.x, furnitureBaseY(f, H, support.get(f.id)) + f.height * lamp.sourceAt, world.z] as [number, number, number],
          color: lampLightColor(f.light!.temperature),
          intensity: lamp.candela * f.light!.intensity,
        };
      })
      .sort((a, b) => b.intensity - a.intensity || a.id.localeCompare(b.id))
      .slice(0, slots);
  }, [lamps, furniture, room, slots]);

  return (
    <group name="lamp-lights">
      {Array.from({ length: slots }, (_, i) => {
        const light = active[i];
        return (
          <pointLight
            key={i}
            name="lamp-light"
            userData={{ lampId: light?.id ?? null }}
            position={light?.position ?? [0, -10, 0]}
            color={light?.color ?? '#ffffff'}
            intensity={enabled && light ? light.intensity : 0}
            distance={0}
            decay={2}
          />
        );
      })}
    </group>
  );
}
