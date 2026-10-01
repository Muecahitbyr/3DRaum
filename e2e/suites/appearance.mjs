import { chromium } from 'playwright-core';
import { freeRoom, livingRoom, lRoom, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * Gestaltung und Darstellung: Decke (alle Raumformen, ein/aus, Farbe), Bearbeiten/
 * Vorschau inkl. Vorschaukamera, Lichtstimmungen und Helligkeit, neue Bodenbeläge,
 * Wandoberflächen, Undo/Redo (Farbwähler/Schieberegler als ein Schritt), Speichern/
 * Laden, Migration (alter Look) und 2D.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 200) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const design = page.getByTestId('design-panel');
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const mode = async (label) => { await page.getByTestId('view-3d-mode').getByRole('button', { name: label }).click(); await settle(1000); };

const scene = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__().scene;
  const ceiling = s.getObjectByName('ceiling');
  const floor = s.getObjectByName('floor');
  const area = (g) => {
    const p = g.getAttribute('position');
    let a = 0;
    for (let i = 0; i < p.count; i += 3) a += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i))) / 2;
    return Math.round(a * 1000) / 1000;
  };
  ceiling.geometry.computeBoundingBox();
  const amb = s.getObjectByName('ambient-light');
  const sun = s.getObjectByName('sun-light');
  const walls = {};
  s.traverse((o) => {
    if (o.userData?.wallId) {
      walls[o.userData.wallId] = {
        opacity: o.material.opacity,
        color: o.material.color.getHexString(),
        map: !!o.material.map,
        bump: !!o.material.bumpMap,
        edges: o.children.length > 0,
      };
    }
  });
  return {
    ceiling: { visible: ceiling.visible, y: ceiling.geometry.boundingBox.min.y, area: area(ceiling.geometry), color: ceiling.material.color.getHexString(), normalY: ceiling.geometry.getAttribute('normal').getY(0) },
    floorArea: area(floor.geometry),
    floorMaterial: floor.userData.materialId,
    floorMap: floor.material.map ? floor.material.map.image.width : 0,
    ambient: { sky: amb.color.getHexString(), ground: amb.groundColor.getHexString(), intensity: +amb.intensity.toFixed(4) },
    sun: { color: sun.color.getHexString(), intensity: +sun.intensity.toFixed(4), castShadow: sun.castShadow },
    walls,
  };
});
const camera = () => page.evaluate(() => { const c = window.__PLANNER_R3F__().camera; return { p: c.position.toArray(), fov: c.fov }; });
const roomInfo = () => page.evaluate(() => { const g = window.__PLANNER_R3F__().scene.getObjectByName('room'); return { origin: g.userData.origin, polygon: g.userData.polygon }; });
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i]; const b = poly[j]; if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; };

// ---------- 1. Standard: Decke vorhanden, in der Bearbeitung ausgeblendet ----------
let s = await scene();
check('Decke: vorhanden, Raumhöhe 2,50, nach unten gerichtet, weiß', near(s.ceiling.y, 2.5, 1e-5) && s.ceiling.normalY === -1 && s.ceiling.color === 'ffffff');
check('Decke: exakt dieselbe Fläche wie der Boden (20 m²)', s.ceiling.area === 20 && s.floorArea === 20, JSON.stringify([s.ceiling.area, s.floorArea]));
check('3D-Bearbeiten: Decke standardmäßig aus', s.ceiling.visible === false);
check('Neue Projekte: Lichtstimmung Tageslicht (100 %)', (await design.getByTestId('lighting-preset').locator('[aria-pressed="true"]').textContent()) === 'Tageslicht' && (await page.getByTestId('lighting-brightness-value').textContent()) === '100 %');
await design.getByTestId('ceiling-toggle').check(); await settle(300);
check('„Decke anzeigen“: Decke sichtbar', (await scene()).ceiling.visible === true);
check('„Decke anzeigen“ ist eine Ansichtsoption (kein Verlaufsschritt)', !(await page.getByTestId('history-undo').isEnabled()));
await view('2D');
check('2D: keine Decke', (await scene()).ceiling.visible === false);
await view('3D');
await design.getByTestId('ceiling-toggle').uncheck(); await settle(300);

// Deckenfarbe: Zwischenwerte des Farbwählers = ein Schritt
{
  const input = design.getByTestId('ceiling-color-input');
  await input.focus();
  for (const c of ['#f0f0f0', '#e0e8f0', '#dfe8f2']) {
    await input.evaluate((el, value) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, c);
    await settle(80);
  }
  await input.blur(); await settle();
}
s = await scene();
check('Deckenfarbe übernommen', s.ceiling.color === 'dfe8f2');
check('Farbwähler: drei Zwischenwerte = ein Schritt „Deckenfarbe ändern“', (await undoTitle()) === 'Deckenfarbe ändern rückgängig');
await key('ControlOrMeta+z');
check('Undo: Decke wieder weiß, kein weiterer Schritt', (await scene()).ceiling.color === 'ffffff' && !(await page.getByTestId('history-undo').isEnabled()));
await key('ControlOrMeta+Shift+z');

// ---------- 2. Lichtstimmungen und Helligkeit ----------
const PRESETS = {
  Tageslicht: { sky: 'f3f7ff', ground: 'e9e3d9', ambient: 2.45, sun: 'fff7ec', sunIntensity: 2.1 },
  Warm: { sky: 'fff1e0', ground: 'ebdfcf', ambient: 2.15, sun: 'ffe0bd', sunIntensity: 1.6 },
  Neutral: { sky: 'ffffff', ground: 'e6e1d9', ambient: 2.6, sun: 'ffffff', sunIntensity: 1.8 },
  Kühl: { sky: 'eaf1ff', ground: 'e1e6ee', ambient: 2.45, sun: 'e8efff', sunIntensity: 1.75 },
};
const presetShots = {};
for (const [label, p] of Object.entries(PRESETS)) {
  await design.getByTestId('lighting-preset').getByRole('button', { name: label }).click(); await settle(400);
  s = await scene();
  check(`Lichtstimmung „${label}“: Umgebungs- und Hauptlicht`, s.ambient.sky === p.sky && s.ambient.ground === p.ground && near(s.ambient.intensity, p.ambient) && s.sun.color === p.sun && near(s.sun.intensity, p.sunIntensity) && s.sun.castShadow, JSON.stringify([s.ambient, s.sun]));
  presetShots[label] = await page.screenshot({ clip: { x: 700, y: 250, width: 500, height: 350 } });
}
check('Verlauf: „Lichtstimmung ändern“', (await undoTitle()) === 'Lichtstimmung ändern rückgängig');
// Sichtbar unterschiedliche Stimmungen: mittlere Bildfarbe unterscheidet sich (Warm röter, Kühl blauer)
const avg = (buf) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4; return [r / n, g / n, b / n];
}, buf.toString('base64'));
const warm = await avg(presetShots.Warm);
const cool = await avg(presetShots.Kühl);
check('Warm vs. Kühl sichtbar unterschiedlich (Rot-Blau-Verhältnis)', warm[0] / warm[2] > cool[0] / cool[2] + 0.02, JSON.stringify([warm.map(Math.round), cool.map(Math.round)]));
check('Keine überstrahlten/schwarzen Flächen (Mittelwerte 60–245)', [warm, cool].every((c) => c.every((v) => v > 60 && v < 245)));
{
  const slider = design.getByTestId('lighting-brightness');
  await slider.focus();
  for (const v of ['0.9', '0.8', '0.7']) {
    await slider.evaluate((el, value) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await settle(60);
  }
  await slider.blur(); await settle();
}
s = await scene();
check('Helligkeit 70 %: Licht skaliert', near(s.ambient.intensity, 2.45 * 0.7) && near(s.sun.intensity, 1.75 * 0.7) && (await page.getByTestId('lighting-brightness-value').textContent()) === '70 %', JSON.stringify(s.ambient));
check('Schieberegler: Zwischenwerte = ein Schritt „Helligkeit ändern“', (await undoTitle()) === 'Helligkeit ändern rückgängig');
await key('ControlOrMeta+z');
check('Undo: Helligkeit wieder 100 %', near((await scene()).ambient.intensity, 2.45));

// ---------- 3. Bodenbeläge ----------
const FLOORS = ['wood-light', 'wood-dark', 'tiles', 'concrete', 'carpet', 'oak', 'parquet-dark', 'herringbone', 'tiles-large-light', 'tiles-large-dark', 'carpet-light', 'carpet-dark'];
check('Zwölf Bodenbeläge zur Auswahl (inkl. der bisherigen)', (await design.locator('[data-testid^="floor-option-"]').count()) === 12);
for (const id of FLOORS.slice(5)) {
  await design.getByTestId(`floor-option-${id}`).click(); await settle(250);
  s = await scene();
  check(`Boden „${id}“: aktiv mit Textur`, s.floorMaterial === id && s.floorMap >= 512, `${s.floorMaterial} ${s.floorMap}`);
}
check('Verlauf: „Bodenbelag ändern“', (await undoTitle()) === 'Bodenbelag ändern rückgängig');

// ---------- 4. Wandoberflächen ----------
await design.getByTestId('wall-option-north').click(); await settle();
await design.getByTestId('wall-finish').getByRole('button', { name: 'Feinputz' }).click(); await settle(300);
s = await scene();
check('Feinputz an der Nordwand: Relief, andere Wände matt', s.walls.north.bump && !s.walls.east.bump && s.walls.north.color === 'fbfbfa', JSON.stringify(s.walls.north));
check('Verlauf: „Wandoberfläche ändern“', (await undoTitle()) === 'Wandoberfläche ändern rückgängig');
await design.getByTestId('wall-finish').getByRole('button', { name: 'Betonoptik' }).click(); await settle(300);
check('Betonoptik: Farb- und Reliefstruktur', (await scene()).walls.north.map && (await scene()).walls.north.bump);
await design.getByTestId('wall-finish-apply-all').click(); await settle(300);
s = await scene();
check('Oberfläche auf alle Wände', Object.values(s.walls).every((w) => w.map && w.bump));
await key('ControlOrMeta+z'); await key('ControlOrMeta+z');
s = await scene();
check('Undo: Nordwand wieder Feinputz (Relief), übrige matt (ohne Textur)', s.walls.north.bump && !s.walls.east.bump && !s.walls.east.map, JSON.stringify(s.walls));
await shot('01-finishes');

// ---------- 5. Speichern / Laden der Gestaltung ----------
await design.getByTestId('floor-option-herringbone').click(); await settle();
await design.getByTestId('lighting-preset').getByRole('button', { name: 'Warm' }).click(); await settle();
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Gestaltung 5');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichert (Version 6): Boden, Wandoberfläche, Deckenfarbe, Lichtstimmung', stored.version === 6 && stored.plan.design.floor === 'herringbone' && stored.plan.design.wallFinishes.north === 'plaster' && stored.plan.design.ceilingColor === '#dfe8f2' && stored.plan.design.lighting.preset === 'warm' && stored.plan.design.lighting.brightness === 1, JSON.stringify(stored.plan.design));
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Gestaltung 5' }).getByTestId('project-open').click(); await settle(700);
s = await scene();
check('Geladen: alles wiederhergestellt', s.floorMaterial === 'herringbone' && s.walls.north.bump && s.ceiling.color === 'dfe8f2' && s.ambient.sky === 'fff1e0' && (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');

// ---------- 6. Migration Version 4 → alter Look ----------
await page.evaluate(() => {
  localStorage.setItem('raumplaner:project:alt-v4', JSON.stringify({
    format: 'raumplaner-project', version: 4, id: 'alt-v4', name: 'Altes Projekt 4', createdAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-01T08:00:00.000Z',
    plan: {
      room: { shape: 'rectangle', height: 2.5, walls: [
        { id: 'north', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, height: 2.5, thickness: 0.15 },
        { id: 'east', start: { x: 5, z: 0 }, end: { x: 5, z: 4 }, height: 2.5, thickness: 0.15 },
        { id: 'south', start: { x: 5, z: 4 }, end: { x: 0, z: 4 }, height: 2.5, thickness: 0.15 },
        { id: 'west', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, height: 2.5, thickness: 0.15 },
      ] },
      openings: [], fixtures: [], groups: [],
      furniture: [{ id: 'furniture-1', type: 'sofa', name: 'Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2.5, z: 2 }, rotationDeg: 0 }],
      design: { floor: 'carpet', wallColors: { north: '#a8b8c8', east: '#fbfbfa', south: '#fbfbfa', west: '#fbfbfa' } },
    },
  }));
});
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Altes Projekt 4' }).getByTestId('project-open').click(); await settle(700);
s = await scene();
check('Version 4 öffnet ohne Warnung', (await page.getByTestId('project-notice').textContent()) === '„Altes Projekt 4“ geöffnet.');
check('Migration: bisherige Beleuchtung (Neutral = frühere feste Werte: ffffff/e6e1d9 2,6 · Sonne 1,8)', s.ambient.sky === 'ffffff' && s.ambient.ground === 'e6e1d9' && s.ambient.intensity === 2.6 && s.sun.color === 'ffffff' && s.sun.intensity === 1.8, JSON.stringify([s.ambient, s.sun]));
check('Migration: Decke weiß, Wände matt, Boden und Farben unverändert', s.ceiling.color === 'ffffff' && Object.values(s.walls).every((w) => !w.map && !w.bump) && s.floorMaterial === 'carpet' && s.walls.north.color === 'a8b8c8');
check('Migration: Sofa ohne eigene Farbe (Standardfarbe)', await page.evaluate(() => { let c = null; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureType === 'sofa') o.traverse((m) => { if (m.isMesh && m.material?.color && !c && m.name !== 'furniture-bounds' && m.name !== 'contact-shadow') c = m.material.color.getHexString(); }); }); return c; }) === '7d8ea3');

// ---------- 7. Decke und Vorschau in allen Raumformen ----------
for (const [label, data, area] of [['Rechteck', livingRoom('daylight'), 24.75], ['L-Form', lRoom(), 25], ['Freie Form', freeRoom(), 18.875]]) {
  await openScene(page, data);
  s = await scene();
  check(`${label}: Decke = Bodenkontur (${area} m²), in 2,60 m`, s.ceiling.area === area && s.floorArea === area && near(s.ceiling.y, 2.6, 1e-5), JSON.stringify([s.ceiling.area, s.floorArea]));
  const editCam = await camera();
  await mode('Vorschau');
  const r = await roomInfo();
  const cam = await camera();
  s = await scene();
  const plan = { x: cam.p[0] + r.origin.x, z: cam.p[2] + r.origin.z };
  check(`${label}: Vorschau – Decke sichtbar, keine ausgeblendeten Wände, keine Hilfskanten`, s.ceiling.visible && Object.values(s.walls).every((w) => w.opacity === 1 && !w.edges), JSON.stringify(Object.values(s.walls).map((w) => w.opacity)));
  check(`${label}: Vorschaukamera auf Augenhöhe im Raum (weiter Blickwinkel)`, inside(plan, r.polygon) && near(cam.p[1], 1.6, 0.01) && cam.fov === 60, JSON.stringify(cam));
  // Kräftig drehen/zoomen: Kamera bleibt im Raum
  await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(1300, 300, { steps: 12 }); await page.mouse.up();
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 600); await settle(60); }
  await settle(600);
  const after = await camera();
  const p2 = { x: after.p[0] + r.origin.x, z: after.p[2] + r.origin.z };
  check(`${label}: Kamera bleibt beim Drehen/Zoomen im Raum und unter der Decke`, inside(p2, r.polygon) && after.p[1] < 2.6 - 0.1 && after.p[1] > 0.3, JSON.stringify(after.p));
  if (label === 'L-Form') await shot('02-preview-l');
  await mode('Bearbeiten');
  const back = await camera();
  check(`${label}: zurück zu „Bearbeiten“ – vorherige Kamera wiederhergestellt`, back.p.every((v, i) => near(v, editCam.p[i], 0.02)) && back.fov === 45, JSON.stringify([back.p, editCam.p]));
  s = await scene();
  check(`${label}: Bearbeiten – Decke wieder aus, Hilfskanten da`, !s.ceiling.visible && Object.values(s.walls).every((w) => w.edges));
}
await mode('Vorschau');
check('Vorschau: Bedienhinweise ausgeblendet', await page.locator('[class*="hint"][hidden]').count() >= 1);
await view('2D');
check('2D unabhängig von der Vorschau: keine Decke', !(await scene()).ceiling.visible);
await view('3D');
await mode('Bearbeiten');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
