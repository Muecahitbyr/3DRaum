import type { ReactNode } from 'react';
import { FURNITURE_COLORS as C } from '../../../../config/furniture';
import { hobGeometry, KITCHEN as K, sinkGeometry } from '../../../../config/furnitureGeometry';
import { clamp } from '../../../../utils/units';
import { Part, Rod, colorOf, derivedOf } from './parts';
import type { FurnitureModelProps } from './types';

/**
 * Prozedurale Küchenmöbel (Vorderseite +z): Korpus auf Sockel, Fronten mit Fugen und
 * Griffleisten, Arbeitsplatte mit Überstand. Maße der Bauteile aus `config/furnitureGeometry`.
 */

const fronts = (props: FurnitureModelProps) => ({
  front: colorOf(props.colors, 'main', C.kitchenFront),
  body: derivedOf(props.colors, 'main', C.kitchenBody, -0.06),
  top: colorOf(props.colors, 'wood', C.worktop),
});

/** Front (Tür oder Schublade) mit Griffleiste oben. */
function Front({ x0, x1, y0, y1, z, color }: { x0: number; x1: number; y0: number; y1: number; z: number; color: string }) {
  const w = x1 - x0 - K.gap;
  const h = y1 - y0 - K.gap;
  return (
    <group>
      <Part position={[(x0 + x1) / 2, (y0 + y1) / 2, z - K.handle - K.front / 2]} size={[w, h, K.front]} color={color} roughness={0.45} />
      <Part position={[(x0 + x1) / 2, y1 - Math.min(0.045, h * 0.2), z - K.handle / 2]} size={[Math.min(0.32, w * 0.6), 0.012, K.handle]} color={C.handle} roughness={0.3} />
    </group>
  );
}

/**
 * Gemeinsamer Unterbau: Sockel, Korpus, Arbeitsplatte (optional mit Ausschnitt für ein Becken);
 * die Fronten liefert `children` für die Frontzone.
 */
function BaseUnit({ width: w, depth: d, height: h, bodyColor, topColor, cutout, children }: { width: number; depth: number; height: number; bodyColor: string; topColor: string; cutout?: { w: number; d: number; z: number; depth: number }; children?: (zone: { y0: number; y1: number; z: number }) => ReactNode }) {
  const bodyTop = h - K.worktop;
  const bodyDepth = d - K.front - K.handle - 0.02;
  // Mit Becken: Korpus endet unter dem Becken, darüber schließen Seiten- und Rückwand.
  const solidTop = cutout ? h - cutout.depth - 0.01 : bodyTop;
  const panel = 0.018;
  return (
    <group>
      <Part position={[0, K.plinth / 2, -d / 2 + (bodyDepth - K.plinthSetback) / 2]} size={[w - 0.01, K.plinth, bodyDepth - K.plinthSetback]} color={C.plinth} />
      <Part position={[0, (K.plinth + solidTop) / 2, -d / 2 + bodyDepth / 2]} size={[w, solidTop - K.plinth, bodyDepth]} color={bodyColor} />
      {cutout && (
        <>
          {[-1, 1].map((sx) => (
            <Part key={sx} position={[sx * (w / 2 - panel / 2), (solidTop + bodyTop) / 2, -d / 2 + bodyDepth / 2]} size={[panel, bodyTop - solidTop, bodyDepth]} color={bodyColor} />
          ))}
          <Part position={[0, (solidTop + bodyTop) / 2, -d / 2 + panel / 2]} size={[w - 2 * panel, bodyTop - solidTop, panel]} color={bodyColor} />
        </>
      )}
      {cutout ? (
        // Arbeitsplatte um den Beckenausschnitt herum (vorn, hinten, links, rechts).
        <>
          <Part position={[0, h - K.worktop / 2, (cutout.z + cutout.d / 2 + d / 2) / 2]} size={[w, K.worktop, d / 2 - cutout.z - cutout.d / 2]} color={topColor} roughness={0.35} />
          <Part position={[0, h - K.worktop / 2, (-d / 2 + cutout.z - cutout.d / 2) / 2]} size={[w, K.worktop, cutout.z - cutout.d / 2 + d / 2]} color={topColor} roughness={0.35} />
          {[-1, 1].map((sx) => (
            <Part key={sx} position={[(sx * (w / 2 + cutout.w / 2)) / 2, h - K.worktop / 2, cutout.z]} size={[w / 2 - cutout.w / 2, K.worktop, cutout.d]} color={topColor} roughness={0.35} />
          ))}
        </>
      ) : (
        <Part position={[0, h - K.worktop / 2, 0]} size={[w, K.worktop, d]} color={topColor} roughness={0.35} />
      )}
      {children?.({ y0: K.plinth, y1: bodyTop, z: d / 2 - 0.02 })}
    </group>
  );
}

/** Unterschrank: oben Schublade, darunter Tür(en). */
export function KitchenBaseModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  const doors = w > 0.65 ? 2 : 1;
  return (
    <BaseUnit width={w} depth={d} height={h} bodyColor={c.body} topColor={c.top}>
      {({ y0, y1, z }) => {
        const drawer = y1 - Math.min(0.18, (y1 - y0) * 0.25);
        return (
          <>
            <Front x0={-w / 2} x1={w / 2} y0={drawer} y1={y1} z={z} color={c.front} />
            {Array.from({ length: doors }, (_, i) => (
              <Front key={i} x0={-w / 2 + (w / doors) * i} x1={-w / 2 + (w / doors) * (i + 1)} y0={y0} y1={drawer} z={z} color={c.front} />
            ))}
          </>
        );
      }}
    </BaseUnit>
  );
}

/** Spülenschrank: Unterschrank mit eingelassenem Becken und Wasserhahn. */
export function KitchenSinkModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  const s = sinkGeometry(w, d);
  const depthIn = 0.16;
  const wall = 0.008;
  return (
    <group>
      <BaseUnit width={w} depth={d} height={h} bodyColor={c.body} topColor={c.top} cutout={{ w: s.basinW, d: s.basinD, z: s.basinZ, depth: depthIn }}>
        {({ y0, y1, z }) => (
          <>
            <Front x0={-w / 2} x1={0} y0={y0} y1={y1} z={z} color={c.front} />
            <Front x0={0} x1={w / 2} y0={y0} y1={y1} z={z} color={c.front} />
          </>
        )}
      </BaseUnit>
      {/* Becken: in den Ausschnitt eingelassen – Edelstahlwände, Boden mit Ablauf */}
      <Part position={[0, h - depthIn, s.basinZ]} size={[s.basinW, wall, s.basinD]} color={C.steelDark} roughness={0.3} />
      {[-1, 1].map((sx) => (
        <Part key={`x${sx}`} position={[sx * (s.basinW / 2 - wall / 2), h - depthIn / 2, s.basinZ]} size={[wall, depthIn, s.basinD]} color={C.steel} roughness={0.25} />
      ))}
      {[-1, 1].map((sz) => (
        <Part key={`z${sz}`} position={[0, h - depthIn / 2, s.basinZ + sz * (s.basinD / 2 - wall / 2)]} size={[s.basinW, depthIn, wall]} color={C.steel} roughness={0.25} />
      ))}
      <Rod position={[0, h - depthIn + 0.006, s.basinZ]} radius={0.025} height={0.004} color={C.metal} />
      {/* Wasserhahn: Säule und Auslauf (ragt wie in echt über die Arbeitshöhe) */}
      <Rod position={[0, h + 0.13, s.tapZ]} radius={0.016} height={0.26} color={C.chrome} />
      <Part position={[0, h + 0.25, s.tapZ + 0.08]} size={[0.025, 0.025, 0.17]} color={C.chrome} roughness={0.2} />
    </group>
  );
}

/** Herd mit Backofen: Kochfeld (vier Zonen), Bedienblende, Backofentür mit Sichtfenster. */
export function KitchenStoveModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  const hob = hobGeometry(w, d);
  return (
    <group>
      <BaseUnit width={w} depth={d} height={h} bodyColor={c.body} topColor={c.top}>
        {({ y0, y1, z }) => {
          const panel = y1 - 0.09;
          const doorTop = panel - 0.01;
          const doorBottom = Math.max(y0 + 0.08, doorTop - 0.6);
          return (
            <>
              {/* Bedienblende mit Drehknöpfen */}
              <Part position={[0, (panel + y1) / 2, z - K.front / 2]} size={[w - K.gap, y1 - panel - K.gap, K.front]} color={C.steelDark} roughness={0.35} />
              {[-0.3, -0.1, 0.1, 0.3].map((k) => (
                <Rod key={k} position={[k * (w - 0.1), (panel + y1) / 2, z + 0.004]} radius={0.016} height={0.012} color={C.chrome} />
              ))}
              {/* Backofentür: Rahmen, dunkles Sichtfenster, Griffstange */}
              <Part position={[0, (doorBottom + doorTop) / 2, z - K.front / 2 - K.handle]} size={[w - K.gap, doorTop - doorBottom, K.front]} color={C.steel} roughness={0.3} />
              <Part position={[0, (doorBottom + doorTop) / 2 - 0.02, z - K.handle - 0.001]} size={[w - 0.16, (doorTop - doorBottom) * 0.55, 0.004]} color={C.ovenGlass} roughness={0.1} />
              <Part position={[0, doorTop - 0.05, z - K.handle / 2]} size={[w - 0.12, 0.014, K.handle]} color={C.chrome} roughness={0.2} />
              {doorBottom > y0 + 0.01 && <Front x0={-w / 2} x1={w / 2} y0={y0} y1={doorBottom} z={z} color={c.front} />}
            </>
          );
        }}
      </BaseUnit>
      {/* Kochfeld: schwarzes Glas bündig in der Arbeitsplatte, vier Kochzonen */}
      <Part position={[0, h - 0.0025, 0]} size={[w - 0.06, 0.006, d - 0.1]} color={C.hob} roughness={0.15} />
      {hob.zones.map(([x, z, r], i) => (
        <mesh key={i} position={[x, h + 0.0008, z]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r * 0.82, r, 28]} />
          <meshStandardMaterial color={C.hobZone} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/** Oberschrank (Wandmontage): Korpus mit Türen, Unterkante = Standhöhe. */
export function KitchenWallModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  const doors = w > 0.65 ? 2 : 1;
  const bodyDepth = d - K.front - K.handle;
  return (
    <group>
      <Part position={[0, h / 2, -d / 2 + bodyDepth / 2]} size={[w, h, bodyDepth]} color={c.body} />
      {Array.from({ length: doors }, (_, i) => {
        const x0 = -w / 2 + (w / doors) * i;
        const x1 = x0 + w / doors;
        const fw = x1 - x0 - K.gap;
        return (
          <group key={i}>
            <Part position={[(x0 + x1) / 2, h / 2, d / 2 - K.handle - K.front / 2]} size={[fw, h - K.gap, K.front]} color={c.front} roughness={0.45} />
            {/* Griff unten (Oberschränke öffnet man von unten) */}
            <Part position={[(x0 + x1) / 2, 0.05, d / 2 - K.handle / 2]} size={[Math.min(0.3, fw * 0.6), 0.012, K.handle]} color={C.handle} roughness={0.3} />
          </group>
        );
      })}
    </group>
  );
}

/** Hochschrank: Sockel, zwei übereinanderliegende Türen. */
export function KitchenTallModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  // Ohne Arbeitsplatte: Fronten und Griffe schließen bündig mit der Vorderkante ab.
  const bodyDepth = d - K.front - K.handle;
  const split = K.plinth + (h - K.plinth) * 0.42;
  return (
    <group>
      <Part position={[0, K.plinth / 2, -d / 2 + (bodyDepth - K.plinthSetback) / 2]} size={[w - 0.01, K.plinth, bodyDepth - K.plinthSetback]} color={C.plinth} />
      <Part position={[0, (K.plinth + h) / 2, -d / 2 + bodyDepth / 2]} size={[w, h - K.plinth, bodyDepth]} color={c.body} />
      <Front x0={-w / 2} x1={w / 2} y0={K.plinth} y1={split} z={d / 2} color={c.front} />
      <Front x0={-w / 2} x1={w / 2} y0={split} y1={h} z={d / 2} color={c.front} />
    </group>
  );
}

/** Kühlschrank: Gehäuse, Kühlteil oben und Gefrierteil unten mit senkrechten Griffen. */
export function FridgeModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const body = colorOf(props.colors, 'main', C.fridge);
  const door = derivedOf(props.colors, 'main', C.fridgeDoor, 0.08);
  const doorT = 0.04;
  const bodyDepth = d - doorT - 0.025;
  const split = h * (h > 1.4 ? 0.36 : 0);
  const handleX = w / 2 - 0.06;
  const doorsAt: [number, number][] = split > 0 ? [[0.02, split - 0.006], [split + 0.006, h - 0.01]] : [[0.02, h - 0.01]];
  return (
    <group>
      <Part position={[0, h / 2, -d / 2 + bodyDepth / 2]} size={[w, h, bodyDepth]} color={body} roughness={0.35} />
      {doorsAt.map(([y0, y1], i) => (
        <group key={i}>
          <Part position={[0, (y0 + y1) / 2, -d / 2 + bodyDepth + doorT / 2]} size={[w - 0.006, y1 - y0, doorT]} color={door} roughness={0.3} />
          <Part position={[handleX, i === doorsAt.length - 1 ? y0 + Math.min(0.35, (y1 - y0) * 0.35) : y1 - Math.min(0.25, (y1 - y0) * 0.4), d / 2 - 0.0125]} size={[0.02, clamp((y1 - y0) * 0.35, 0.12, 0.45), 0.025]} color={C.chrome} roughness={0.2} />
        </group>
      ))}
    </group>
  );
}

/** Kücheninsel: Unterschrankblock (Fronten vorn) mit Arbeitsplatte, Überstand zur Sitzseite. */
export function KitchenIslandModel(props: FurnitureModelProps) {
  const { width: w, depth: d, height: h } = props;
  const c = fronts(props);
  const overhang = Math.min(K.islandOverhang, d * 0.3);
  const blockDepth = d - overhang;
  const blockZ = d / 2 - blockDepth / 2;
  const bodyTop = h - K.worktop;
  const units = Math.max(2, Math.round(w / 0.6));
  return (
    <group>
      <Part position={[0, K.plinth / 2, blockZ - K.plinthSetback / 2]} size={[w - 0.02, K.plinth, blockDepth - K.plinthSetback - 0.04]} color={C.plinth} />
      <Part position={[0, (K.plinth + bodyTop) / 2, blockZ - 0.015]} size={[w, bodyTop - K.plinth, blockDepth - 0.03]} color={c.body} />
      <Part position={[0, h - K.worktop / 2, 0]} size={[w, K.worktop, d]} color={c.top} roughness={0.35} />
      {Array.from({ length: units }, (_, i) => {
        const x0 = -w / 2 + (w / units) * i;
        const x1 = x0 + w / units;
        const drawer = bodyTop - Math.min(0.18, (bodyTop - K.plinth) * 0.25);
        return (
          <group key={i}>
            <Front x0={x0} x1={x1} y0={drawer} y1={bodyTop} z={d / 2} color={c.front} />
            <Front x0={x0} x1={x1} y0={K.plinth} y1={drawer} z={d / 2} color={c.front} />
          </group>
        );
      })}
    </group>
  );
}
