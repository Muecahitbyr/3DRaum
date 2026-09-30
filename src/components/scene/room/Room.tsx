import { useMemo, useRef } from 'react';
import { wallColorOf, wallFinishOf } from '../../../config/design';
import type { CollisionSeverity } from '../../../collision';
import type { RoomDesign } from '../../../types/design';
import type { RoomFixture } from '../../../types/fixture';
import type { Opening } from '../../../types/opening';
import type { RoomModel } from '../../../utils/room/model';
import { Ceiling } from './Ceiling';
import { Floor } from './Floor';
import { Wall } from './Wall';

/** 'model' = realistische 3D-Darstellung, 'plan' = kontrastreicher Grundriss-Stil für die 2D-Ansicht. */
export type RoomVariant = 'model' | 'plan';

const NO_OPENINGS: readonly Opening[] = [];
const NO_FIXTURES: readonly RoomFixture[] = [];
const noop = () => {};

interface RoomProps {
  room: RoomModel;
  design: RoomDesign;
  openings: readonly Opening[];
  selectedOpeningId: string | null;
  fixtures?: readonly RoomFixture[];
  selectedFixtureId?: string | null;
  /** Grundriss-Editor: ausgewählte Wand (hervorgehoben). */
  selectedWallId?: string | null;
  severityById: ReadonlyMap<string, CollisionSeverity>;
  onSelectOpening: (id: string | null) => void;
  onSelectFixture?: (id: string) => void;
  /** Grundriss-Editor aktiv: Klick auf eine Wand wählt sie aus. */
  onSelectWall?: ((id: string) => void) | null;
  variant?: RoomVariant;
  /** 3D-Vorschau: Wände nicht ausblenden. */
  preview?: boolean;
  /** Decke sichtbar (nur 3D). */
  showCeiling?: boolean;
}

/** Boden und Wände aus dem Raumumriss (beliebige geschlossene Form). */
export function Room({
  room,
  design,
  openings,
  selectedOpeningId,
  fixtures = NO_FIXTURES,
  selectedFixtureId = null,
  selectedWallId = null,
  severityById,
  onSelectOpening,
  onSelectFixture = noop,
  onSelectWall = null,
  variant = 'model',
  preview = false,
  showCeiling = false,
}: RoomProps) {
  const openingsByWall = useStableByWall(openings);
  const fixturesByWall = useStableByWall(fixtures);

  return (
    // userData: Grundriss für Tests/Debugging (Ursprung, Umriss in Grundrisskoordinaten).
    <group name="room" userData={{ origin: room.origin, polygon: room.polygon, shape: room.plan.shape }}>
      <Floor room={room} material={design.floor} variant={variant} />
      <Ceiling room={room} color={design.ceilingColor} visible={variant === 'model' && showCeiling} />
      {room.walls.map((wall) => (
        <Wall
          key={wall.id}
          wall={wall}
          variant={variant}
          color={wallColorOf(design, wall.id)}
          finish={wallFinishOf(design, wall.id)}
          fade={!preview}
          openings={openingsByWall[wall.id] ?? NO_OPENINGS}
          selectedOpeningId={selectedOpeningId}
          fixtures={fixturesByWall[wall.id] ?? NO_FIXTURES}
          selectedFixtureId={selectedFixtureId}
          selected={wall.id === selectedWallId}
          severityById={severityById}
          onSelectOpening={onSelectOpening}
          onSelectFixture={onSelectFixture}
          onSelectWall={onSelectWall}
        />
      ))}
    </group>
  );
}

/**
 * Gruppiert wandgebundene Elemente je Wand und behält die Listen unveränderter Wände bei.
 * So wird z. B. beim Ziehen nur die Geometrie der betroffenen Wand neu erzeugt.
 */
function useStableByWall<T extends { wall: string }>(items: readonly T[]) {
  const previous = useRef<Record<string, T[]>>({});
  return useMemo(() => {
    const grouped: Record<string, T[]> = {};
    for (const item of items) (grouped[item.wall] ??= []).push(item);
    for (const id of Object.keys(grouped)) {
      const before = previous.current[id];
      const now = grouped[id];
      if (before && before.length === now.length && before.every((o, i) => o === now[i])) grouped[id] = before;
    }
    previous.current = grouped;
    return grouped;
  }, [items]);
}
