import { chromium } from 'playwright-core';
import { polygonWalls } from '../lib/scenes.mjs';

/**
 * Speicherkompatibilität: dasselbe logische Projekt in allen Formatversionen
 * (1 = altes Rechteck ohne Gestaltung, 2 = vor Raumobjekten/Türanschlag, 3 = vor freien
 * Raumformen, 4 = vor Decke/Licht, 5 = aktuell) muss nach der Migration denselben Plan
 * und in der 3D-Szene exakt dieselbe Geometrie ergeben. Dazu L-Form und freie Form 4 → 5.
 */
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(900);
const settle = (ms = 200) => page.waitForTimeout(ms);

// ---------- Dasselbe Projekt in allen Versionen (Rechteck 5 × 4 × 2,5 m)
const meta = (version, id) => ({ format: 'raumplaner-project', version, id, name: `Version ${version}`, createdAt: '2025-01-01T10:00:00.000Z', updatedAt: '2025-01-01T10:00:00.000Z' });
const furniture = [
  { id: 'furniture-1', type: 'sofa', name: 'Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2.5, z: 3.4 }, rotationDeg: 180 },
  { id: 'furniture-2', type: 'coffee-table', name: 'Couchtisch', width: 1.1, depth: 0.6, height: 0.42, position: { x: 2.5, z: 2.2 }, rotationDeg: 0 },
  { id: 'furniture-3', type: 'shelf', name: 'Regal', width: 0.8, depth: 0.35, height: 1.8, position: { x: 4.7, z: 1.5 }, rotationDeg: 90 },
];
// Versionen 1–3: Süd-/Westwand von links/oben gemessen; ab 4 ab Wandanfang (5 − 1 − 0,9 = 3,1; 4 − 0,5 − 1,2 = 2,3).
const openingsOld = (details) => [
  { id: 'opening-1', type: 'door', wall: 'south', offset: 1, width: 0.9, height: 2.1, ...(details ? { hinge: 'right', swing: 'inward' } : {}) },
  { id: 'opening-2', type: 'window', wall: 'west', offset: 0.5, width: 1.2, height: 1.3, sillHeight: 0.9, ...(details ? { sashes: 1 } : {}) },
  { id: 'opening-3', type: 'window', wall: 'north', offset: 1.5, width: 1.4, height: 1.3, sillHeight: 0.9, ...(details ? { sashes: 1 } : {}) },
];
const openingsNew = [
  { id: 'opening-1', type: 'door', wall: 'south', offset: 3.1, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' },
  { id: 'opening-2', type: 'window', wall: 'west', offset: 2.3, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 1 },
  { id: 'opening-3', type: 'window', wall: 'north', offset: 1.5, width: 1.4, height: 1.3, sillHeight: 0.9, sashes: 1 },
];
const colors = { north: '#fbfbfa', east: '#fbfbfa', south: '#a8b8c8', west: '#fbfbfa' };
const wall = (id, s, e) => ({ id, start: { x: s[0], z: s[1] }, end: { x: e[0], z: e[1] }, height: 2.5, thickness: 0.15 });
const rectWalls = [wall('north', [0, 0], [5, 0]), wall('east', [5, 0], [5, 4]), wall('south', [5, 4], [0, 4]), wall('west', [0, 4], [0, 0])];
const dims = { width: 5, length: 4, height: 2.5 };

const versions = {
  1: { ...meta(1, 'v1'), plan: { dimensions: dims, openings: openingsOld(false), furniture } },
  2: { ...meta(2, 'v2'), plan: { dimensions: dims, openings: openingsOld(false), furniture, design: { floor: 'wood-dark', wallColors: colors } } },
  3: { ...meta(3, 'v3'), plan: { dimensions: dims, openings: openingsOld(true), furniture, fixtures: [], groups: [], design: { floor: 'wood-dark', wallColors: colors } } },
  4: { ...meta(4, 'v4'), plan: { room: { shape: 'rectangle', height: 2.5, walls: rectWalls }, openings: openingsNew, furniture, fixtures: [], groups: [], design: { floor: 'wood-dark', wallColors: colors } } },
  5: {
    ...meta(5, 'v5'),
    plan: {
      room: { shape: 'rectangle', height: 2.5, walls: rectWalls }, openings: openingsNew, furniture, fixtures: [], groups: [],
      design: { floor: 'wood-dark', wallColors: colors, wallFinishes: {}, ceilingColor: '#ffffff', lighting: { preset: 'neutral', brightness: 1 } },
    },
  },
};

// ---------- 1. Datenebene (Parser direkt aus den Dev-Modulen)
const parsed = await page.evaluate(async (versions) => {
  const format = await import('/src/projects/format.ts');
  const out = {};
  for (const [v, data] of Object.entries(versions)) {
    const r = format.parseProject(JSON.stringify(data));
    out[v] = r.ok ? { ok: true, version: r.project.version, plan: r.project.plan, warnings: r.warnings } : { ok: false, error: r.error };
  }
  out.defaultDesign = format.DEFAULT_PLAN.design;
  return out;
}, versions);
for (const v of [1, 2, 3, 4, 5]) check(`Version ${v}: lesbar, ohne Warnungen, auf Version 5 gehoben`, parsed[v].ok && parsed[v].version === 5 && parsed[v].warnings.length === 0, JSON.stringify(parsed[v].error ?? parsed[v].warnings));
const strip = (plan, design = true) => JSON.stringify({ ...plan, design: design ? plan.design : undefined });
for (const v of [2, 3, 4]) check(`Version ${v} → 5: Plan identisch mit aktuellem Format`, strip(parsed[v].plan) === strip(parsed[5].plan), v);
check('Version 1 → 5: Geometrie, Öffnungen, Möbel identisch', strip(parsed[1].plan, false) === strip(parsed[5].plan, false));
check('Version 1 → 5: Standardgestaltung + bisherige Beleuchtung', parsed[1].plan.design.floor === parsed.defaultDesign.floor && parsed[1].plan.design.lighting.preset === 'neutral' && parsed[1].plan.design.lighting.brightness === 1 && parsed[1].plan.design.ceilingColor === '#ffffff');
check('Version 1/2 → 3: Türanschlag wie bisher (Süd: rechts, nach innen), Fenster einflügelig', ['1', '2'].every((v) => { const o = parsed[v].plan.openings; return o[0].hinge === 'right' && o[0].swing === 'inward' && o[1].sashes === 1; }));
check('Version 3 → 4: Süd-/West-Abstände auf Wandanfang umgerechnet', parsed[3].plan.openings[0].offset === 3.1 && parsed[3].plan.openings[1].offset === 2.3 && parsed[3].plan.openings[2].offset === 1.5);

const trimmed = await page.evaluate(async (data) => {
  const format = await import('/src/projects/format.ts');
  const copy = JSON.parse(JSON.stringify(data));
  copy.plan.furniture[0].name = '  Sofa groß  ';
  const r = format.parseProject(JSON.stringify(copy));
  return r.ok ? r.project.plan.furniture[0].name : r.error;
}, versions[5]);
check('Einlesen: Möbelnamen ohne Leerzeichen am Rand, Wörter erhalten', trimmed === 'Sofa groß', trimmed);

// ---------- 2. Szenenebene: identische 3D-Geometrie nach dem Öffnen
const signature = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const round = (v) => Math.round(v * 1000) / 1000;
  const out = [];
  s.scene.updateMatrixWorld(true);
  s.scene.traverse((o) => {
    const id = o.userData?.wallId ?? o.userData?.furnitureId ?? o.userData?.openingId ?? o.userData?.fixtureId;
    if (!id) return;
    const entry = [o.name || id, ...o.matrixWorld.elements.map(round)];
    if (o.geometry) {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      entry.push(...[b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(round));
    }
    out.push(entry.join(','));
  });
  return out.sort();
});
async function openVersion(data) {
  await page.evaluate((d) => localStorage.setItem(`raumplaner:project:${d.id}`, JSON.stringify(d)), data);
  await page.getByTestId('projects-button').click(); await settle(300);
  await page.locator(`[data-project-id="${data.id}"]`).getByTestId('project-open').click(); await settle(300);
  if (await page.getByTestId('confirm-accept').count()) await page.getByTestId('confirm-accept').click();
  await settle(900);
}
const sigs = {};
for (const v of [5, 4, 3, 2, 1]) {
  await openVersion(versions[v]);
  sigs[v] = await signature();
}
check('Szene: Wände, Öffnungen und Möbel vorhanden', sigs[5].length >= 10, `${sigs[5].length} Objekte`);
for (const v of [1, 2, 3, 4]) {
  const diff = sigs[v].filter((x, i) => x !== sigs[5][i]);
  check(`Szene Version ${v}: geometrisch identisch mit Version 5`, sigs[v].length === sigs[5].length && diff.length === 0, diff.slice(0, 2).join(' | '));
}
// Speichern hebt die Datei auf das aktuelle Format
await page.getByTestId('project-save').click(); await settle(300);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:v1')));
check('Version 1 nach dem Speichern: Format 5, gleicher Name', stored.version === 5 && stored.name === 'Version 1' && stored.plan.room.walls.length === 4);

// ---------- 3. L-Form und freie Form (diagonale Wand) 4 → 5
const lCorners = [[0, 0], [6, 0], [6, 3], [3.5, 3], [3.5, 5], [0, 5]];
const freeCorners = [[0, 0], [5, 0], [5, 2.5], [3.5, 4], [0, 4]];
for (const [label, shape, corners] of [['L-Form', 'l-shape', lCorners], ['Freie Form', 'free', freeCorners]]) {
  const walls = polygonWalls(corners, 2.5);
  const base = {
    room: { shape, height: 2.5, walls },
    openings: [{ id: 'opening-1', type: 'window', wall: 'wall-1', offset: 1, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 2 }],
    furniture: [{ id: 'furniture-1', type: 'table', name: 'Tisch', width: 1.6, depth: 0.9, height: 0.75, position: { x: 2, z: 1.5 }, rotationDeg: 0 }],
    fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'wall-1', offset: 3, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 }],
    groups: [],
  };
  const colors5 = Object.fromEntries(walls.map((w) => [w.id, '#eeeeee']));
  const v4 = { ...meta(4, `${shape}-v4`), plan: { ...base, design: { floor: 'tiles', wallColors: colors5 } } };
  const v5 = { ...meta(5, `${shape}-v5`), plan: { ...base, design: { floor: 'tiles', wallColors: colors5, wallFinishes: {}, ceilingColor: '#ffffff', lighting: { preset: 'neutral', brightness: 1 } } } };
  await openVersion(v5); const s5 = await signature();
  await openVersion(v4); const s4 = await signature();
  check(`${label} 4 → 5: geometrisch identisch`, s4.length === s5.length && s4.every((x, i) => x === s5[i]), `${s4.length}/${s5.length}`);
  const lighting = await page.getByTestId('lighting-preset').locator('[aria-pressed="true"]').textContent().catch(() => '');
  check(`${label} 4 → 5: bisherige Beleuchtung „Neutral“`, lighting.includes('Neutral'), lighting);
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
