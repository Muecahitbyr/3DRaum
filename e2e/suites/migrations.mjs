import { chromium } from 'playwright-core';
import { polygonWalls } from '../lib/scenes.mjs';

/**
 * Speicherkompatibilität: dasselbe logische Projekt in allen Formatversionen
 * (1 = altes Rechteck ohne Gestaltung, 2 = vor Raumobjekten/Türanschlag, 3 = vor freien
 * Raumformen, 4 = vor Decke/Licht, 5 = vor Durchgängen, 6 = vor Küche/Bad/Teppich, 7 = aktuell)
 * muss nach der Migration denselben Plan und in der 3D-Szene exakt dieselbe Geometrie ergeben.
 * Dazu L-Form und freie Form 4 → 7, ein Durchgang (neu in Version 6) sowie Küchen-, Bad- und
 * Dekomöbel (neu in Version 7): speichern, laden, Datei.
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
versions[6] = { ...versions[5], ...meta(6, 'v6') };
versions[7] = { ...versions[5], ...meta(7, 'v7') };
const CURRENT = 7;

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
for (const v of [1, 2, 3, 4, 5, 6, 7]) check(`Version ${v}: lesbar, ohne Warnungen, auf Version ${CURRENT} gehoben`, parsed[v].ok && parsed[v].version === CURRENT && parsed[v].warnings.length === 0, JSON.stringify(parsed[v].error ?? parsed[v].warnings));
const strip = (plan, design = true) => JSON.stringify({ ...plan, design: design ? plan.design : undefined });
for (const v of [2, 3, 4, 5, 6]) check(`Version ${v} → 7: Plan identisch mit aktuellem Format`, strip(parsed[v].plan) === strip(parsed[7].plan), v);
check('Version 1 → 7: Geometrie, Öffnungen, Möbel identisch', strip(parsed[1].plan, false) === strip(parsed[7].plan, false));
check('Version 5 → 6: Türen und Fenster unverändert', JSON.stringify(parsed[5].plan.openings) === JSON.stringify(parsed[6].plan.openings) && parsed[6].plan.openings.every((o) => o.type !== 'passage'));
check('Version 6 → 7: Plan vollständig unverändert (reine Versionsanhebung)', JSON.stringify(parsed[6].plan) === JSON.stringify(parsed[7].plan));
check('Version 1 → 7: Standardgestaltung + bisherige Beleuchtung', parsed[1].plan.design.floor === parsed.defaultDesign.floor && parsed[1].plan.design.lighting.preset === 'neutral' && parsed[1].plan.design.lighting.brightness === 1 && parsed[1].plan.design.ceilingColor === '#ffffff');
check('Version 1/2 → 3: Türanschlag wie bisher (Süd: rechts, nach innen), Fenster einflügelig', ['1', '2'].every((v) => { const o = parsed[v].plan.openings; return o[0].hinge === 'right' && o[0].swing === 'inward' && o[1].sashes === 1; }));
check('Version 3 → 4: Süd-/West-Abstände auf Wandanfang umgerechnet', parsed[3].plan.openings[0].offset === 3.1 && parsed[3].plan.openings[1].offset === 2.3 && parsed[3].plan.openings[2].offset === 1.5);

const trimmed = await page.evaluate(async (data) => {
  const format = await import('/src/projects/format.ts');
  const copy = JSON.parse(JSON.stringify(data));
  copy.plan.furniture[0].name = '  Sofa groß  ';
  const r = format.parseProject(JSON.stringify(copy));
  return r.ok ? r.project.plan.furniture[0].name : r.error;
}, versions[7]);
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
const eastFaces = () => page.evaluate(() => window.__PLANNER_R3F__().scene.getObjectByName('wall-east-body').geometry.attributes.position.count);
let eastPlain = 0;
for (const v of [7, 6, 5, 4, 3, 2, 1]) {
  await openVersion(versions[v]);
  sigs[v] = await signature();
  if (v === 7) eastPlain = await eastFaces();
}
check('Szene: Wände, Öffnungen und Möbel vorhanden', sigs[7].length >= 10, `${sigs[7].length} Objekte`);
for (const v of [1, 2, 3, 4, 5, 6]) {
  const diff = sigs[v].filter((x, i) => x !== sigs[7][i]);
  check(`Szene Version ${v}: geometrisch identisch mit Version 7`, sigs[v].length === sigs[7].length && diff.length === 0, diff.slice(0, 2).join(' | '));
}
// Speichern hebt die Datei auf das aktuelle Format
await page.getByTestId('project-save').click(); await settle(300);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:v1')));
check('Version 1 nach dem Speichern: Format 7, gleicher Name', stored.version === 7 && stored.name === 'Version 1' && stored.plan.room.walls.length === 4);

// ---------- 3. L-Form und freie Form (diagonale Wand) 4 → 5 → 6 → 7
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
  const v6 = { ...v5, ...meta(6, `${shape}-v6`) };
  const v7 = { ...v5, ...meta(7, `${shape}-v7`) };
  await openVersion(v7); const s7 = await signature();
  await openVersion(v6); const s6 = await signature();
  await openVersion(v5); const s5 = await signature();
  await openVersion(v4); const s4 = await signature();
  const same = (a) => a.length === s7.length && a.every((x, i) => x === s7[i]);
  check(`${label} 4 → 7: geometrisch identisch`, same(s4), `${s4.length}/${s7.length}`);
  check(`${label} 5 → 7: geometrisch identisch`, same(s5), `${s5.length}/${s7.length}`);
  check(`${label} 6 → 7: geometrisch identisch`, same(s6), `${s6.length}/${s7.length}`);
  const lighting = await page.getByTestId('lighting-preset').locator('[aria-pressed="true"]').textContent().catch(() => '');
  check(`${label} 4 → 7: bisherige Beleuchtung „Neutral“`, lighting.includes('Neutral'), lighting);
}

// ---------- 4. Durchgang (neu in Version 6): öffnen, Szene, speichern, Datei
const withPassage = {
  ...versions[6],
  ...meta(6, 'durchgang'),
  plan: { ...versions[6].plan, openings: [...openingsNew, { id: 'opening-4', type: 'passage', wall: 'east', offset: 1.4, width: 1.2, height: 2.1 }] },
};
await openVersion(withPassage);
const passageSig = await signature();
check('Durchgang: in der Szene als Öffnung der Ostwand (mit Wandaussparung)', passageSig.length === sigs[7].length + 1 && passageSig.some((x) => x.startsWith('opening-4,')), `${passageSig.length}`);
const eastWithPassage = await eastFaces();
check('Durchgang: Ostwand hat eine echte Aussparung (mehr Flächen als ohne Öffnung)', eastWithPassage > eastPlain, `${eastPlain} → ${eastWithPassage}`);
await page.getByTestId('project-save').click(); await settle(300);
const storedPassage = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:durchgang')));
const savedPassage = storedPassage.plan.openings.find((o) => o.type === 'passage');
check('Durchgang gespeichert (Version 7): Wand, Position, Breite, Höhe – ohne Tür-/Fensterfelder', storedPassage.version === 7 && savedPassage && savedPassage.wall === 'east' && savedPassage.offset === 1.4 && savedPassage.width === 1.2 && savedPassage.height === 2.1 && !('hinge' in savedPassage) && !('sillHeight' in savedPassage), JSON.stringify(savedPassage));
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle(300);
await page.locator('[data-project-id="durchgang"]').getByTestId('project-open').click(); await settle(900);
const reloaded = await signature();
check('Durchgang nach Neuladen: Szene identisch', reloaded.length === passageSig.length && reloaded.every((x, i) => x === passageSig[i]));

// ---------- 5. Küche, Bad, Teppich, Pflanze, Wandfliesen (neu in Version 7): öffnen, speichern, neu laden
const newItems = [
  { id: 'furniture-1', type: 'kitchen-base', name: 'Unterschrank', width: 0.6, depth: 0.6, height: 0.9, position: { x: 0.3, z: 0.3 }, rotationDeg: 0, colors: { main: '#2f4f6f', wood: '#c9b28f' } },
  { id: 'furniture-2', type: 'kitchen-wall', name: 'Oberschrank', width: 0.6, depth: 0.35, height: 0.7, position: { x: 0.3, z: 0.18 }, rotationDeg: 0, elevation: 1.5 },
  { id: 'furniture-3', type: 'fridge', name: 'Kühlschrank', width: 0.6, depth: 0.65, height: 2, position: { x: 0.9, z: 0.33 }, rotationDeg: 0 },
  { id: 'furniture-4', type: 'bathtub', name: 'Wanne', width: 1.7, depth: 0.75, height: 0.6, position: { x: 4.15, z: 3.62 }, rotationDeg: 180 },
  { id: 'furniture-5', type: 'rug', name: 'Teppich', width: 2, depth: 1.4, height: 0.01, position: { x: 2.5, z: 2 }, rotationDeg: 0, colors: { fabric: '#7a5c8e' } },
  { id: 'furniture-6', type: 'plant', name: 'Pflanze', width: 0.45, depth: 0.45, height: 1.2, position: { x: 4.6, z: 0.4 }, rotationDeg: 0 },
];
const v7Items = {
  ...meta(7, 'neu-v7'),
  plan: { ...versions[7].plan, openings: [], furniture: newItems, design: { ...versions[7].plan.design, wallFinishes: { north: 'tiles' } } },
};
await openVersion(v7Items);
const itemsSig = await signature();
check('Version 7: Küchen-, Bad- und Dekomöbel erscheinen in der Szene', newItems.every((f) => itemsSig.some((x) => x.includes(f.id))), `${itemsSig.length}`);
const parsedItems = await page.evaluate(async (d) => (await import('/src/projects/format.ts')).parseProject(JSON.stringify(d)), v7Items);
check('Version 7: Elemente ohne Warnung gelesen (Oberschrank-Höhe, Farben, Wandfliesen)', parsedItems.ok && parsedItems.warnings.length === 0 && parsedItems.project.plan.furniture.length === 6 && parsedItems.project.plan.furniture[1].elevation === 1.5 && parsedItems.project.plan.furniture[4].colors.fabric === '#7a5c8e' && parsedItems.project.plan.design.wallFinishes.north === 'tiles', JSON.stringify(parsedItems.warnings ?? parsedItems.error));
await page.getByTestId('project-save').click(); await settle(300);
const storedItems = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:neu-v7')));
check('Gespeichert (Version 7): Möbel, Höhen, Farben und Fliesen unverändert', storedItems.version === 7 && JSON.stringify(storedItems.plan.furniture) === JSON.stringify(parsedItems.project.plan.furniture) && storedItems.plan.design.wallFinishes.north === 'tiles');
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle(300);
await page.locator('[data-project-id="neu-v7"]').getByTestId('project-open').click(); await settle(900);
const itemsReloaded = await signature();
check('Version 7 nach Neuladen: Szene identisch', itemsReloaded.length === itemsSig.length && itemsReloaded.every((x, i) => x === itemsSig[i]));
const future = { ...versions[7], ...meta(8, 'zukunft') };
const futureResult = await page.evaluate(async (d) => (await import('/src/projects/format.ts')).parseProject(JSON.stringify(d)), future);
check('Version 8 (Zukunft): verständlich abgelehnt', !futureResult.ok && futureResult.error.includes('neueren Version'), futureResult.error);

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
