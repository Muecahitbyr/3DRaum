import { Edges, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EdgesGeometry, type Group } from 'three';
import { PLAN_DESIGN_CONFIG, WALL_FINISHES } from '../../../config/design';
import type { WallFinish } from '../../../types/design';
import { getWallTextures } from '../materials/wallTextures';
import { SCENE_COLORS } from '../../../config/scene';
import type { CollisionSeverity } from '../../../collision';
import type { HexColor } from '../../../types/design';
import type { RoomFixture } from '../../../types/fixture';
import type { Opening } from '../../../types/opening';
import type { WallSegment } from '../../../types/room';
import { getFixtureLocalSpan } from '../../../utils/fixtures';
import { getOpeningLocalSpan } from '../../../utils/openings';
import type { WallShare } from '../../../utils/building/sharedWalls';
import { buildWallGeometry, type WallCutout } from '../../../utils/wallGeometry';
import { FixtureElement } from './fixtures/FixtureElement';
import { CLICK_DRAG_TOLERANCE_PX, OpeningElement } from './openings/OpeningElement';
import type { RoomVariant } from './Room';
import { useWallFade } from './useWallFade';

/** Winkel-Schwellwert für Kanten – wie der Standard von drei `Edges`. */
const EDGE_THRESHOLD_DEG = 15;

interface WallProps {
  wall: WallSegment;
  variant: RoomVariant;
  /** Wandfarbe (3D: Wandfläche, Grundriss: schmaler Streifen an der Innenkante). */
  color: HexColor;
  openings: readonly Opening[];
  selectedOpeningId: string | null;
  /** Raumobjekte an dieser Wand (Heizkörper, Steckdosen, Schalter). */
  fixtures: readonly RoomFixture[];
  selectedFixtureId: string | null;
  /** Kollisionsstatus je Öffnung/Raumobjekt (zentraler Kollisionsbericht). */
  severityById: ReadonlyMap<string, CollisionSeverity>;
  onSelectOpening: (id: string | null) => void;
  onSelectFixture: (id: string) => void;
  /** Oberfläche (nur 3D). */
  finish?: WallFinish;
  /** Kameraabhängiges Ausblenden (3D-Bearbeitungsansicht); in der Vorschau aus. */
  fade?: boolean;
  /** Grundriss-Editor: Wand hervorheben … */
  selected?: boolean;
  /** … und per Klick auswählen (`null` = Editor aus). */
  onSelectWall?: ((id: string) => void) | null;
  /**
   * Gemeinsame Wand mit einem Nachbarzimmer: Abschnitte, die das Nachbarzimmer zeichnet,
   * entfallen; dessen Türen/Fenster durchbrechen diese Wand.
   */
  share?: WallShare | null;
  /** Rechtsklick auf eine Tür/ein Fenster/einen Durchgang: Kontextmenü. */
  onOpeningContextMenu?: ((id: string, x: number, y: number) => void) | null;
}

export function Wall({
  wall,
  variant,
  color: wallColor,
  openings,
  selectedOpeningId,
  fixtures,
  selectedFixtureId,
  severityById,
  onSelectOpening,
  onSelectFixture,
  selected = false,
  onSelectWall = null,
  finish = 'matte',
  fade = true,
  share = null,
  onOpeningContextMenu = null,
}: WallProps) {
  const { length } = wall;
  const isPlan = variant === 'plan';

  const spans = useMemo(
    () => openings.map((opening) => ({ opening, span: getOpeningLocalSpan(opening, wall) })),
    [openings, wall],
  );

  // Gemeinsame Wand: entfallende Abschnitte und Öffnungen des Nachbarzimmers.
  const shared = useMemo<WallCutout[]>(
    () => (share ? [...share.hidden, ...share.foreign.map((opening) => getOpeningLocalSpan(opening, wall))] : []),
    [share, wall],
  );

  // 3D: echte Öffnungen in Originalgröße. Grundriss: Öffnungen über die volle Höhe
  // aussparen, damit sie – wie im Grundrissschnitt üblich – von oben sichtbar sind.
  const geometry = useMemo(
    () =>
      buildWallGeometry(
        length,
        wall.height,
        wall.thickness,
        [...spans.map(({ span }) => span), ...shared].map((span) => (isPlan ? { ...span, y0: 0, y1: wall.height } : span)),
        { outerStart: wall.outerStart, outerEnd: wall.outerEnd },
      ),
    [length, wall.height, wall.thickness, wall.outerStart, wall.outerEnd, spans, shared, isPlan],
  );
  // Farbstreifen im Grundriss nur dort, wo diese Wand gezeichnet wird.
  const stripSpans = useMemo(() => visibleSpans(length, share?.hidden ?? []), [length, share]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Kantenzahl (gleicher Winkel-Schwellwert wie drei `Edges`) – Schlüssel für die Kantenlinien.
  const edgeCount = useMemo(() => {
    const edges = new EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
    const count = edges.attributes.position.count;
    edges.dispose();
    return count;
  }, [geometry]);

  // Grundriss: Wände bleiben dunkel (Lesbarkeit); die Wandfarbe erscheint nur als Streifen.
  const color = isPlan ? (selected ? SCENE_COLORS.selection : SCENE_COLORS.planWall) : wallColor;
  const stripWidth = PLAN_DESIGN_CONFIG.wallStripWidth;

  // 3D: Steht die Wand zwischen Kamera und Raum, wird sie weich ausgeblendet und
  // nimmt dann keine Klicks mehr an. Im Grundriss bleibt alles unverändert.
  const groupRef = useRef<Group>(null);
  const interactive = useWallFade(groupRef, wall, !isPlan && fade);
  const surface = WALL_FINISHES[finish];
  const textures = isPlan ? null : getWallTextures(finish);
  useEffect(() => {
    if (!textures) return;
    for (const texture of [textures.map, textures.bump]) texture.repeat.set(1 / surface.repeatSize, 1 / surface.repeatSize);
  }, [textures, surface.repeatSize]);
  // Grundriss-Editor: Wände sind anklickbar.
  const [hovered, setHovered] = useState(false);
  const selectable = isPlan && !!onSelectWall;
  useCursor(hovered && selectable, 'pointer');

  // Die Wand verdeckt Elemente dahinter: Klick/Hover werden hier gestoppt, sonst
  // würde R3F ein verdecktes Fenster hinter einer massiven Wand auswählen.
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > CLICK_DRAG_TOLERANCE_PX) return;
    if (isPlan && onSelectWall) onSelectWall(wall.id);
    else onSelectOpening(null);
  };

  return (
    <group
      ref={groupRef}
      name={`wall-${wall.id}`}
      position={[wall.center.x, 0, wall.center.z]}
      rotation-y={wall.rotationY}
    >
      <mesh
        name={`wall-${wall.id}-body`}
        // Nicht an der Gruppe: deren userData nutzt das Ausblenden (Sichtbarkeit je Frame).
        userData={{ wallId: wall.id }}
        geometry={geometry}
        castShadow={!isPlan && interactive}
        receiveShadow
        onClick={interactive ? handleClick : undefined}
        // 3D: Eine sichtbare Wand verdeckt Möbel dahinter auch fürs Greifen (sonst würde ein
        // ausgewähltes Möbel hinter der Wand gezogen). Die Kamera erhält das Ereignis weiterhin.
        onPointerDown={interactive && !isPlan ? (event) => event.stopPropagation() : undefined}
        onPointerOver={
          interactive
            ? (event) => {
                event.stopPropagation();
                if (selectable) setHovered(true);
              }
            : undefined
        }
        onPointerOut={selectable ? () => setHovered(false) : undefined}
      >
        {/* Neues Material je Oberfläche: Texturwechsel erfordert neue Shader-Varianten. */}
        <meshStandardMaterial
          key={isPlan ? 'plan' : finish}
          color={color}
          roughness={isPlan ? 0.9 : surface.roughness}
          map={textures?.map ?? null}
          bumpMap={textures?.bump ?? null}
          bumpScale={surface.bumpScale}
        />
        {/* Technische Kanten nur zum Bearbeiten – die Vorschau wirkt ohne sie realistischer.
            Bei geänderter Kantenzahl neu aufbauen: Edges befüllt sonst die alte Liniengeometrie, und
            three.js behält deren Segmentanzahl bei (Streulinien bzw. fehlende Kanten). */}
        {(isPlan || fade) && <Edges key={edgeCount} color={isPlan ? color : SCENE_COLORS.wallEdge} />}
      </mesh>
      {isPlan &&
        stripSpans.map(([x0, x1], i) => (
          <mesh
            key={i}
            name={i === 0 ? `wall-${wall.id}-plan-strip` : `wall-${wall.id}-plan-strip-${i}`}
            // Innenkante liegt bei lokal z = +Dicke/2; Streifen knapp über der Wandoberkante,
            // aber unter den Tür-/Fensterflächen (die ihn in Öffnungen überdecken).
            position={[(x0 + x1) / 2, wall.height + 0.004, wall.thickness / 2 - stripWidth / 2]}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[x1 - x0, stripWidth]} />
            <meshBasicMaterial color={wallColor} />
          </mesh>
        ))}
      {fixtures.map((fixture) => (
        <FixtureElement
          key={fixture.id}
          fixture={fixture}
          span={getFixtureLocalSpan(fixture, wall)}
          variant={variant}
          selected={fixture.id === selectedFixtureId}
          status={severityById.get(fixture.id) ?? null}
          interactive={interactive}
          onSelect={onSelectFixture}
        />
      ))}
      {spans.map(({ opening, span }) => (
        <OpeningElement
          key={opening.id}
          opening={opening}
          span={span}
          wall={wall}
          variant={variant}
          selected={opening.id === selectedOpeningId}
          status={severityById.get(opening.id) ?? null}
          interactive={interactive}
          onSelect={onSelectOpening}
          onContextMenu={onOpeningContextMenu}
        />
      ))}
    </group>
  );
}

/** Sichtbare Abschnitte [x0, x1] (lokal, −L/2 … L/2) ohne die von Nachbarn gezeichneten. */
function visibleSpans(length: number, hidden: readonly WallCutout[]): [number, number][] {
  let spans: [number, number][] = [[-length / 2, length / 2]];
  for (const cut of hidden) {
    spans = spans.flatMap(([a, b]): [number, number][] => {
      if (cut.x1 <= a || cut.x0 >= b) return [[a, b]];
      return [
        [a, Math.max(a, cut.x0)],
        [Math.min(b, cut.x1), b],
      ].filter(([x0, x1]) => x1 - x0 > 1e-3) as [number, number][];
    });
  }
  return spans;
}
