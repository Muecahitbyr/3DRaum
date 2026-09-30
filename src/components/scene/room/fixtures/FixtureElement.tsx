import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { DoubleSide } from 'three';
import type { CollisionSeverity } from '../../../../collision';
import type { RoomFixture } from '../../../../types/fixture';
import type { FixtureLocalSpan } from '../../../../utils/fixtures';
import { useOpeningDrag } from '../../interaction/OpeningDragProvider';
import { CLICK_DRAG_TOLERANCE_PX } from '../openings/OpeningElement';
import type { RoomVariant } from '../Room';
import { RadiatorModel, SocketModel, SwitchModel } from './FixtureModels';
import { FIXTURE_PLAN_Y, FIXTURE_SYMBOL_RADIUS, FixturePlanSymbol } from './FixturePlanSymbol';

/** Mindestgröße der Klickfläche, damit auch kleine Objekte gut greifbar sind. */
const MIN_HIT_SIZE = 0.2;

interface FixtureElementProps {
  fixture: RoomFixture;
  span: FixtureLocalSpan;
  variant: RoomVariant;
  selected: boolean;
  status: CollisionSeverity | null;
  /** `false`, solange die zugehörige Wand in 3D ausgeblendet ist. */
  interactive: boolean;
  onSelect: (id: string) => void;
}

/**
 * Raumobjekt (Heizkörper, Steckdose, Schalter) im lokalen Wandsystem: Auswahl,
 * Hover und – im Grundriss – Ziehen entlang der Wände (wie Türen/Fenster).
 */
export function FixtureElement({ fixture, span, variant, selected, status, interactive, onSelect }: FixtureElementProps) {
  const isPlan = variant === 'plan';
  const drag = useOpeningDrag();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, isPlan && drag ? 'grab' : 'pointer');
  useEffect(() => {
    if (!interactive) setHovered(false);
  }, [interactive]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!isPlan || !drag || event.button !== 0) return;
    event.stopPropagation();
    onSelect(fixture.id);
    drag.startDrag({ kind: 'fixture', item: fixture }, event);
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta <= CLICK_DRAG_TOLERANCE_PX) onSelect(fixture.id);
  };

  const props = { span, selected };
  const cx = (span.x0 + span.x1) / 2;
  const small = fixture.type !== 'radiator';
  const hitWidth = Math.max(span.x1 - span.x0, MIN_HIT_SIZE);
  const hitDepth = small ? FIXTURE_SYMBOL_RADIUS * 2.2 : Math.max(span.z1 - span.z0, MIN_HIT_SIZE / 2);

  return (
    <group
      name={fixture.id}
      userData={{ fixtureId: fixture.id, fixtureType: fixture.type }}
      onClick={interactive ? handleClick : undefined}
      onPointerDown={interactive ? handlePointerDown : undefined}
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              setHovered(true);
            }
          : undefined
      }
      onPointerOut={interactive ? () => setHovered(false) : undefined}
    >
      {isPlan ? (
        <>
          <FixturePlanSymbol type={fixture.type} span={span} selected={selected} status={status} />
          <mesh position={[cx, FIXTURE_PLAN_Y.hit, span.z0 + hitDepth / 2]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[hitWidth, hitDepth]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={DoubleSide} />
          </mesh>
        </>
      ) : (
        <>
          {fixture.type === 'radiator' ? <RadiatorModel {...props} /> : fixture.type === 'socket' ? <SocketModel {...props} /> : <SwitchModel {...props} />}
          {small && (
            <mesh position={[cx, (span.y0 + span.y1) / 2, span.z1 + 0.002]}>
              <planeGeometry args={[Math.max(span.x1 - span.x0, 0.12), Math.max(span.y1 - span.y0, 0.12)]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={DoubleSide} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
