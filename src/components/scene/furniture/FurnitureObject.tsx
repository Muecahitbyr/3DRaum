import { Edges, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { memo, useState } from 'react';
import { SCENE_COLORS } from '../../../config/scene';
import type { CollisionSeverity } from '../../../collision';
import type { FurniturePickMode } from '../../../state/plannerState';
import type { FurnitureItem } from '../../../types/furniture';
import type { RoomModel } from '../../../utils/room/model';
import { furnitureBaseY, furnitureRotationY, furnitureToWorld } from '../../../utils/furniture';
import { CLICK_DRAG_TOLERANCE_PX } from '../room/openings/OpeningElement';
import type { RoomVariant } from '../room/Room';
import { useFurnitureInteraction } from '../interaction/FurnitureInteractionProvider';
import { FurnitureModel } from './FurnitureModel';
import { FurniturePlanSymbol } from './plan/FurniturePlanSymbol';
import { RotationHandle } from './RotationHandle';

/** Abstand der Auswahl-Umrandung zum Modell. */
const SELECTION_PADDING = 0.02;
/**
 * Ausgewähltes Möbel liegt im Grundriss höher als alle Symbole anderer Möbel
 * (inkl. deren Linien): sichtbar oben und bei Überlappung zuerst greifbar.
 */
const PLAN_SELECTED_LIFT = 0.01;

interface FurnitureObjectProps {
  item: FurnitureItem;
  room: RoomModel;
  variant: RoomVariant;
  selected: boolean;
  /** Einziges ausgewähltes Möbel → Rotations-Handle. */
  soleSelection: boolean;
  /** IDs, die beim Greifen dieses Möbels gemeinsam verschoben werden (Auswahl bzw. Gruppe). */
  moveIds: (item: FurnitureItem) => string[];
  /** Kollisionsstatus aus dem zentralen Kollisionsbericht. */
  status: CollisionSeverity | null;
  onPick: (id: string, mode: FurniturePickMode) => void;
}

/**
 * Ein Möbel in der Szene. Memoisiert: Beim Ziehen eines Möbels rendern nur das gezogene
 * und Möbel mit geändertem Zustand neu (unveränderte Möbel behalten ihre Objektidentität).
 */
export const FurnitureObject = memo(function FurnitureObject({ item, room, variant, selected, soleSelection, moveIds, status, onPick }: FurnitureObjectProps) {
  const isPlan = variant === 'plan';
  const interaction = useFurnitureInteraction();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, isPlan && interaction ? 'grab' : 'pointer');
  const world = furnitureToWorld(item.position, room);
  // Deckenleuchten hängen an der Decke, Tischlampen stehen erhöht – beides folgt der Raumhöhe.
  const baseY = furnitureBaseY(item, room.dimensions.height);

  // 3D: Klick wählt aus (Shift ergänzt). Im Grundriss erledigt das bereits pointerdown.
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (isPlan && interaction) return;
    if (event.delta <= CLICK_DRAG_TOLERANCE_PX) onPick(item.id, event.shiftKey ? 'toggle' : 'replace');
  };

  // Grundriss: linke Maustaste greift das Möbel (Auswahl + Verschieben – bei Mehrfachauswahl
  // bzw. Gruppe alle gemeinsam). Shift+Klick ergänzt/entfernt nur. Andere Tasten bleiben der Kamera.
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isPlan || !interaction || event.button !== 0) return;
    event.stopPropagation();
    if (event.shiftKey) {
      onPick(item.id, 'toggle');
      return;
    }
    const ids = moveIds(item);
    onPick(item.id, 'focus');
    interaction.startMove(item, event, ids);
  };

  return (
    <group
      name={item.id}
      userData={{ furnitureId: item.id, furnitureType: item.type, selected }}
      position={[world.x, baseY + (isPlan && selected ? PLAN_SELECTED_LIFT : 0), world.z]}
      rotation-y={furnitureRotationY(item.rotationDeg)}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {isPlan ? (
        <>
          <FurniturePlanSymbol item={item} selected={selected} status={status} />
          {selected && soleSelection && <RotationHandle item={item} />}
        </>
      ) : (
        <>
          <FurnitureModel item={item} />
          {/* Unsichtbare Bounding Box: großzügige Klickfläche und dezente Auswahl-Umrandung. */}
          <mesh name="furniture-bounds" position={[0, item.height / 2, 0]}>
            <boxGeometry
              args={[item.width + SELECTION_PADDING, item.height + SELECTION_PADDING, item.depth + SELECTION_PADDING]}
            />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            {/* Umrandung: Kollision rot, Warnung bernstein, sonst Auswahl blau – jeweils dezent. */}
            {(selected || status) && (
              <Edges
                name="furniture-outline"
                userData={{ status: status ?? 'selected' }}
                color={status === 'error' ? SCENE_COLORS.conflict : status === 'warning' ? SCENE_COLORS.warning : SCENE_COLORS.selection}
              />
            )}
          </mesh>
        </>
      )}
    </group>
  );
});
