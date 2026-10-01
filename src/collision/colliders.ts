import { COLLISION_CONFIG } from '../config/collision';
import { FIXTURE_CATALOG } from '../config/fixtures';
import type { RoomFixture } from '../types/fixture';
import type { FurnitureItem } from '../types/furniture';
import type { Opening } from '../types/opening';
import type { Meters, WallSegment } from '../types/room';
import { furnitureBaseY, furnitureToWorld } from '../utils/furniture';
import { envelopeZone, furnitureZones, type FurnitureZone } from './furnitureZones';
import { wallPoint, type RoomModel } from '../utils/room/model';
import { quarterSectorPolygon, rectanglePolygon } from './geometry';
import type { Collider, HeightRange, Polygon } from './types';

const ANY_HEIGHT: HeightRange = { min: -Infinity, max: Infinity };

/** Rechteck an einer Wand: `along` entlang der Wand, `into` Richtung Raum (negativ = in die Wand). */
function wallRectangle(wall: WallSegment, along: [Meters, Meters], into: [Meters, Meters]): Polygon {
  return [
    wallPoint(wall, along[0], into[0]),
    wallPoint(wall, along[1], into[0]),
    wallPoint(wall, along[1], into[1]),
    wallPoint(wall, along[0], into[1]),
  ];
}

/** Zone (lokal) → gedrehtes Rechteck in der Welt, Höhe ab Boden. */
function zoneCollider(item: FurnitureItem, zone: FurnitureZone, kind: 'furniture' | 'furnitureEnvelope', center: { x: number; z: number }, baseY: number): Collider {
  const rad = (item.rotationDeg * Math.PI) / 180;
  const cx = (zone.x0 + zone.x1) / 2;
  const cz = (zone.z0 + zone.z1) / 2;
  // Lokale Achsen wie `rectanglePolygon` und das 3D-Modell: x → (cos, sin), z → (−sin, cos).
  const world = { x: center.x + Math.cos(rad) * cx - Math.sin(rad) * cz, z: center.z + Math.sin(rad) * cx + Math.cos(rad) * cz };
  return {
    kind,
    owner: { type: 'furniture', id: item.id },
    footprint: rectanglePolygon(world, (zone.x1 - zone.x0) / 2, (zone.z1 - zone.z0) / 2, item.rotationDeg),
    height: { min: baseY + zone.y0, max: baseY + zone.y1 },
    part: zone.name,
  };
}

/**
 * Möbel: je semantischer Zone ein Kollider (collision/furnitureZones.ts) plus die ganze Hülle,
 * die nur für den Heizkörper zählt. Höhen: Deckenleuchten hängen oben, Tischlampen stehen
 * erhöht bzw. auf ihrem Träger (`supportY`).
 */
export function furnitureColliders(item: FurnitureItem, room: RoomModel, supportY?: number): Collider[] {
  const center = furnitureToWorld(item.position, room);
  const baseY = furnitureBaseY(item, room.dimensions.height, supportY);
  return [
    ...furnitureZones(item).map((zone) => zoneCollider(item, zone, 'furniture', center, baseY)),
    zoneCollider(item, envelopeZone(item), 'furnitureEnvelope', center, baseY),
  ];
}

export function openingColliders(opening: Opening, room: RoomModel): Collider[] {
  const frame = room.wallById.get(opening.wall);
  if (!frame) return [];
  const wallThickness = frame.thickness;
  const owner = { type: 'opening', id: opening.id } as const;
  const along: [Meters, Meters] = [opening.offset, opening.offset + opening.width];

  // Lage in der Wand – für Überschneidungen zwischen Öffnungen (höhenunabhängig).
  // Ein Durchgang hat nur diese Spanne: kein Türblatt, kein Schwenkbereich, keine Fensterzone.
  const colliders: Collider[] = [
    { kind: 'openingSpan', owner, footprint: wallRectangle(frame, along, [-wallThickness, 0]), height: ANY_HEIGHT },
  ];

  if (opening.type === 'door') {
    // Schwenkbereich: Viertelkreis um den Anschlag, Radius = Türbreite, von der geschlossenen
    // Lage (entlang der Wand) bis 90° – nach innen ab der Innenfläche, nach außen ab der
    // Außenfläche der Wand (dort liegt er außerhalb des Raums) – wie das Grundriss-Symbol.
    // Wände laufen – von innen gesehen – von links nach rechts: Anschlag links = am Wandanfang.
    const hingeAtStart = opening.hinge === 'left';
    const outward = opening.swing === 'outward';
    const closed = hingeAtStart ? frame.axis : { x: -frame.axis.x, z: -frame.axis.z };
    const open = outward ? { x: -frame.inward.x, z: -frame.inward.z } : frame.inward;
    colliders.push({
      kind: 'doorSwing',
      owner,
      footprint: quarterSectorPolygon(
        wallPoint(frame, hingeAtStart ? opening.offset : opening.offset + opening.width, outward ? -wallThickness : 0),
        opening.width,
        closed,
        open,
        COLLISION_CONFIG.doorSwingSegments,
      ),
      height: { min: 0, max: opening.height },
    });
  } else if (opening.type === 'window') {
    // Zone direkt vor dem Fenster, nur im Höhenbereich der Fensteröffnung.
    colliders.push({
      kind: 'windowZone',
      owner,
      footprint: wallRectangle(frame, along, [0, COLLISION_CONFIG.windowClearanceDepth]),
      height: { min: opening.sillHeight, max: opening.sillHeight + opening.height },
    });
  }
  return colliders;
}

/** Wandkörper (Gehrungsviereck) – Möbel dürfen nicht in Wände ragen. */
export function wallColliders(room: RoomModel): Collider[] {
  return room.walls.map((wall) => ({
    kind: 'wall' as const,
    owner: { type: 'wall', id: wall.id } as const,
    footprint: [
      wallPoint(wall, 0, 0),
      wallPoint(wall, wall.length, 0),
      wallPoint(wall, wall.outerEnd, -wall.thickness),
      wallPoint(wall, wall.outerStart, -wall.thickness),
    ],
    height: { min: 0, max: wall.height },
  }));
}

/** Raumobjekte: nur Heizkörper nehmen teil (Steckdosen/Schalter stören Möbel nicht). */
export function fixtureColliders(fixture: RoomFixture, room: RoomModel): Collider[] {
  if (!FIXTURE_CATALOG[fixture.type].collides) return [];
  const frame = room.wallById.get(fixture.wall);
  if (!frame) return [];
  return [
    {
      kind: 'radiator',
      owner: { type: 'fixture', id: fixture.id },
      footprint: wallRectangle(frame, [fixture.offset, fixture.offset + fixture.width], [0, fixture.depth]),
      height: { min: fixture.elevation, max: fixture.elevation + fixture.height },
    },
  ];
}
