import { useCallback, useMemo } from 'react';
import type { CollisionSeverity } from '../../../collision';
import type { FurniturePickMode } from '../../../state/plannerState';
import type { FurnitureGroup, FurnitureItem } from '../../../types/furniture';
import type { RoomModel } from '../../../utils/room/model';
import type { RoomVariant } from '../room/Room';
import { isCeilingMounted } from '../../../config/furniture';
import { furnitureBaseY, furnitureRotationY, furnitureToWorld } from '../../../utils/furniture';
import { supportElevations } from '../../../utils/furnitureSupport';
import { ContactShadow } from './ContactShadow';
import { FurnitureObject } from './FurnitureObject';

interface FurnitureLayerProps {
  furniture: readonly FurnitureItem[];
  groups: readonly FurnitureGroup[];
  room: RoomModel;
  variant: RoomVariant;
  /** Alle ausgewählten Möbel (Mehrfachauswahl). */
  selectedIds: readonly string[];
  severityById: ReadonlyMap<string, CollisionSeverity>;
  onPick: (id: string, mode: FurniturePickMode) => void;
}

export function FurnitureLayer({
  furniture,
  groups,
  room,
  variant,
  selectedIds,
  severityById,
  onPick,
}: FurnitureLayerProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  // Tischlampen auf Trägern (Nachttisch, Schreibtisch …) stehen auf deren Oberseite.
  const support = useMemo(() => supportElevations(furniture, room.dimensions.height), [furniture, room.dimensions.height]);
  const groupOf = useMemo(() => {
    const map = new Map<string, readonly string[]>();
    for (const group of groups) for (const id of group.memberIds) map.set(id, group.memberIds);
    return map;
  }, [groups]);

  // Greift man ein Möbel einer Mehrfachauswahl, bewegt sich die ganze Auswahl, sonst das Möbel samt Gruppe.
  const moveIds = useCallback(
    (item: FurnitureItem) =>
      selected.size > 1 && selected.has(item.id) ? [...selected] : [...(groupOf.get(item.id) ?? [item.id])],
    [selected, groupOf],
  );

  return (
    <group name="furniture">
      {furniture.map((item) => (
        <FurnitureObject
          key={item.id}
          item={item}
          room={room}
          variant={variant}
          selected={selected.has(item.id)}
          soleSelection={selectedIds.length === 1}
          moveIds={moveIds}
          status={severityById.get(item.id) ?? null}
          supportY={support.get(item.id)}
          onPick={onPick}
        />
      ))}
      {variant === 'model' && (
        // Kontaktschatten als eigene Ebene – nicht Teil der Möbelgruppen (deren Maße bleiben exakt).
        <group name="contact-shadows">
          {furniture.map((item) => {
            if (isCeilingMounted(item.type) || furnitureBaseY(item, room.dimensions.height, support.get(item.id)) !== 0) return null;
            const world = furnitureToWorld(item.position, room);
            return (
              <group key={item.id} position={[world.x, 0, world.z]} rotation-y={furnitureRotationY(item.rotationDeg)} userData={{ shadowOf: item.id }}>
                <ContactShadow width={item.width} depth={item.depth} />
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
