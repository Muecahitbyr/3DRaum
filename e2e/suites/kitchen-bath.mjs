import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { analyzeImage, exportFile } from '../lib/images.mjs';
import { addFurniture } from '../lib/planner.mjs';
import { bathScene, kitchenScene, livingRug, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * V1.1 Block C – Küche, Bad, Teppich und Pflanze in der Oberfläche: Bibliothek und Suche,
 * Einfügen (Wandplatzierung, Standardmaße, 3D-Modell, 2D-Symbol), Oberschrank (Montagehöhe,
 * höhenabhängige Kollision), Teppich (keine Kollision, unter Möbeln), Bearbeiten (Ziehen,
 * Drehen, Duplizieren, Kopieren, Gruppen, Farben, Undo), Wandfliesen, Speichern/Laden,
 * Export (PNG, PDF, Projektdatei) und Smartphone.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.003) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));
const de = (v) => v.toFixed(2).replace('.', ',');

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 250) => page.waitForTimeout(ms);

const KITCHEN = ['kitchen-base', 'kitchen-sink', 'kitchen-stove', 'kitchen-wall', 'kitchen-tall', 'fridge', 'kitchen-island'];
const BATH = ['toilet', 'washbasin', 'shower', 'bathtub'];
const NEW_TYPES = [...KITCHEN, ...BATH, 'rug', 'plant'];
const LABEL = {
  'kitchen-base': 'Küchenunterschrank', 'kitchen-sink': 'Spülenschrank', 'kitchen-stove': 'Herd mit Backofen', 'kitchen-wall': 'Küchenoberschrank',
  'kitchen-tall': 'Küchenhochschrank', fridge: 'Kühlschrank', 'kitchen-island': 'Kücheninsel', toilet: 'WC', washbasin: 'Waschtisch',
  shower: 'Dusche', bathtub: 'Badewanne', rug: 'Teppich', plant: 'Pflanze',
};
const SIZE = {
  'kitchen-base': [0.6, 0.6, 0.9], 'kitchen-sink': [0.8, 0.6, 0.9], 'kitchen-stove': [0.6, 0.6, 0.9], 'kitchen-wall': [0.6, 0.35, 0.7],
  'kitchen-tall': [0.6, 0.6, 2], fridge: [0.6, 0.65, 2], 'kitchen-island': [1.8, 0.9, 0.92], toilet: [0.4, 0.7, 0.8], washbasin: [0.8, 0.5, 0.85],
  shower: [0.9, 0.9, 2], bathtub: [1.7, 0.75, 0.6], rug: [2, 1.4, 0.01], plant: [0.45, 0.45, 1.2],
};
/** An die Wand gestellt (Rückseite an der Wand); Armaturen dürfen über die Höhe hinausragen. */
const AT_WALL = ['kitchen-base', 'kitchen-sink', 'kitchen-stove', 'kitchen-wall', 'kitchen-tall', 'fridge', 'toilet', 'washbasin', 'shower', 'bathtub'];
const TAP = ['kitchen-sink', 'washbasin', 'bathtub'];

const fp = page.getByTestId('furniture-properties');
const lib = page.getByTestId('furniture-library');
const val = (label) => fp.getByLabel(label, { exact: true }).inputValue();
const setIn = async (label, text) => { const i = fp.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(150); };
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const cardTypes = () => lib.locator('[data-testid^="library-item-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('library-item-', '')));
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const search = async (text) => { await lib.getByTestId('library-search').fill(text); await settle(80); };
const listItem = (name) => page.getByTestId('furniture-list-item').filter({ has: page.locator(`span[title="${name}"]`) });
const selectByName = async (name, shift = false) => { await listItem(name).click({ modifiers: shift ? ['Shift'] : [] }); await settle(); };
const listNames = () => page.getByTestId('furniture-list-item').evaluateAll((els) => els.map((e) => e.querySelector('span[title]').title));
/** Möbel mit Kollisionsmarkierung in der Liste (Name → Schwere). */
const severities = () => page.getByTestId('furniture-list-item').evaluateAll((els) => Object.fromEntries(els.filter((e) => e.querySelector('[data-severity]')).map((e) => [e.querySelector('span[title]').title, e.querySelector('[data-severity]').getAttribute('data-severity')])));
const notices = () => page.getByTestId('collision-notice').evaluateAll((els) => els.map((e) => e.dataset.rule));
const newestId = () => page.evaluate(() => {
  let best = null;
  window.__PLANNER_R3F__().scene.traverse((o) => { const id = o.userData?.furnitureId; if (id && (!best || Number(id.split('-')[1]) > Number(best.split('-')[1]))) best = id; });
  return best;
});
/** ID des (ersten) Möbels eines Typs in der Szene. */
const idOfType = (type) => page.evaluate((type) => {
  let id = null;
  window.__PLANNER_R3F__().scene.traverse((o) => !id && o.userData?.furnitureType === type && (id = o.userData.furnitureId));
  return id;
}, type);
/** Szene: Lage, Unterkante, Drehung, Welt-AABB der Modellteile, Bauteile, 2D-Symbol eines Möbels. */
const info = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__(); const g = s.scene.getObjectByName(id);
  if (!g) return null;
  g.updateWorldMatrix(true, true);
  let box = null, meshes = 0, lines = 0;
  g.traverse((m) => {
    if (m.isLine2 || m.isLineSegments2) { lines++; return; }
    if (!m.isMesh || m.name === 'furniture-bounds') return;
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    box = box ? box.union(b) : b; meshes++;
  });
  const symbol = g.getObjectByName('furniture-plan-symbol');
  const fill = symbol?.children.find((c) => c.isMesh);
  return {
    type: g.userData.furnitureType, x: g.position.x, y: g.position.y, z: g.position.z, rot: Math.round((-g.rotation.y * 180) / Math.PI),
    size: box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] : null, minY: box?.min.y, maxY: box?.max.y, meshes, lines,
    plan: symbol ? { fillY: fill?.position.y, opacity: fill?.material.transparent ? fill.material.opacity : 1, dashed: symbol.children.some((c) => c.material?.dashed) } : null,
  };
}, id);
const stored = (id) => page.evaluate((id) => JSON.parse(localStorage.getItem(`raumplaner:project:${id}`)), id);
const toScreen = (x, z, W, L) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, 0.02, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });

// ---------- 1. Bibliothek: Kategorien Küche/Bad, Suchbegriffe mit und ohne Umlaute, Vorschaubilder
await page.getByTestId('furniture-library-button').click(); await lib.waitFor(); await settle();
await lib.getByTestId('library-category-kitchen').click(); await settle(80);
check('Kategorie Küche: sieben Küchenmöbel', sameSet(await cardTypes(), KITCHEN), (await cardTypes()).join(','));
await lib.getByTestId('library-category-bath').click(); await settle(80);
check('Kategorie Bad: WC, Waschtisch, Dusche, Badewanne', sameSet(await cardTypes(), BATH), (await cardTypes()).join(','));
await lib.getByTestId('library-category-living').click(); await settle(80);
check('Wohnzimmer enthält Teppich und Pflanze', (await cardTypes()).includes('rug') && (await cardTypes()).includes('plant'));
const SEARCHES = [
  ['Küche', KITCHEN], ['kuche', KITCHEN], ['Schrank', ['kitchen-base', 'kitchen-wall', 'kitchen-tall']], ['Spüle', ['kitchen-sink']], ['spule', ['kitchen-sink']],
  ['Herd', ['kitchen-stove']], ['Ofen', ['kitchen-stove']], ['Kühlschrank', ['fridge']], ['kuhlschrank', ['fridge']], ['Insel', ['kitchen-island']],
  ['WC', ['toilet']], ['Toilette', ['toilet']], ['Waschbecken', ['washbasin']], ['Dusche', ['shower']], ['Wanne', ['bathtub']],
  ['Teppich', ['rug']], ['Pflanze', ['plant']],
];
for (const [query, expected] of SEARCHES) {
  await search(query);
  const found = await cardTypes();
  check(`Suche „${query}“ findet ${expected.map((t) => LABEL[t]).join(', ')}`, expected.every((t) => found.includes(t)), found.join(','));
}
await search('');
await page.waitForFunction(() => document.querySelectorAll('[data-testid="library-thumbnail"]').length === 32, null, { timeout: 30000 }).catch(() => {});
const thumbs = await page.evaluate(async (types) => Promise.all(types.map(async (type) => {
  const img = document.querySelector(`[data-testid="library-item-${type}"] img`);
  if (!img) return 0;
  await img.decode().catch(() => {});
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let filled = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 10) filled++;
  return filled / (data.length / 4);
})), NEW_TYPES);
check('Vorschaubilder für alle neuen Objekte (nicht leer)', thumbs.every((t) => t > 0.02), thumbs.map((t) => t.toFixed(2)).join(' '));
await page.screenshot({ path: `${OUT}/01-library.png` });
await page.keyboard.press('Escape'); await settle();

// ---------- 2. Alle neuen Objekte einfügen (leerer Raum 7 × 6 m)
const W = 7, L = 6;
await openScene(page, { ...project('kb-leer', 'Leer 7×6', { walls: rectangleWalls(W, L, 2.6) }), version: 7 });
const added = {};
for (const type of NEW_TYPES) {
  await addFurniture(page, type); await settle(300);
  const id = await newestId();
  added[type] = id;
  const [w, d, h] = SIZE[type];
  const name = await val('Name');
  const [x, z, rot] = [num(await val('X-Position')), num(await val('Z-Position')), num(await val('Rotation'))];
  check(`${LABEL[type]}: eingefügt, ausgewählt, Standardmaße ${de(w)} × ${de(d)} × ${de(h)} m`,
    name === `${LABEL[type]} 1` && (await val('Breite')) === de(w) && (await val('Tiefe')) === de(d) && (await val('Höhe')) === de(h), `${name} ${await val('Breite')}×${await val('Tiefe')}×${await val('Höhe')}`);
  check(`${LABEL[type]}: freier Platz (keine Kollision)`, !(name in (await severities())), JSON.stringify(await severities()));
  if (AT_WALL.includes(type)) {
    // Rückseite = Mitte − Vorderrichtung · Tiefe/2; Vorderrichtung aus der Drehung (0° = Blick nach Süden).
    const r = (rot * Math.PI) / 180;
    const back = { x: x + Math.sin(r) * (d / 2), z: z - Math.cos(r) * (d / 2) };
    const gap = Math.min(Math.abs(back.x), Math.abs(back.x - W), Math.abs(back.z), Math.abs(back.z - L));
    check(`${LABEL[type]}: an die Wand gestellt, Rückseite zur Wand`, gap <= 0.006, `Rückseite ${back.x.toFixed(3)}/${back.z.toFixed(3)}, Drehung ${rot}°`);
  }
  const i = await info(id);
  const swap = Math.abs(i.rot % 180) === 90;
  const [sx, sz] = swap ? [i.size[2], i.size[0]] : [i.size[0], i.size[2]];
  // Oberkante über der Unterkante des Möbels (Waschtisch hängt: Modell beginnt nicht am Boden).
  const top = i.maxY - i.y;
  const heightOk = TAP.includes(type) ? top >= h - 0.003 && top <= h + 0.35 : near(top, h) && i.minY >= i.y - 0.001;
  // Pflanze: natürliche Krone – füllt die Grundfläche weitgehend, ragt aber nie hinaus.
  const footprintOk = type === 'plant' ? sx <= w + 0.003 && sz <= d + 0.003 && sx >= w * 0.8 && sz >= d * 0.8 : near(sx, w) && near(sz, d);
  check(`${LABEL[type]}: 3D-Modell ${type === 'plant' ? 'innerhalb der Grundfläche' : 'in Breite/Tiefe exakt'}, Höhe ${TAP.includes(type) ? '(mit Armatur)' : 'exakt'}, aus ${i.meshes} Bauteilen`,
    footprintOk && heightOk && i.meshes >= (type === 'rug' ? 1 : 3), `${i.size.map((v) => v.toFixed(3)).join(' × ')}, Oberkante ${top.toFixed(3)}`);
}
check('Alle 13 Objekte in der Liste, keine Kollisionen', (await listNames()).length === 13 && JSON.stringify(await severities()) === '{}' && (await notices()).length === 0, JSON.stringify(await severities()));
const wallCab = await info(added['kitchen-wall']);
check('Oberschrank hängt: Unterkante 1,45 m über dem Boden', near(wallCab.y, 1.45) && near(wallCab.minY, 1.45), `${wallCab.y}`);
const rug = await info(added.rug);
check('Teppich liegt auf dem Boden (Unterkante 0, Oberkante ≤ 1 cm)', near(rug.minY, 0, 0.001) && rug.maxY <= 0.011, `${rug.minY}–${rug.maxY}`);
await page.keyboard.press('Escape'); await settle();
await page.evaluate(() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(2, 9, 8); s.invalidate(); }); await settle(900);
await page.screenshot({ path: `${OUT}/02-all-3d.png` });
await view('2D');
await page.screenshot({ path: `${OUT}/03-all-2d.png` });
const plans = Object.fromEntries(await Promise.all(NEW_TYPES.map(async (t) => [t, await info(added[t])])));
check('2D: jedes neue Objekt hat ein Plansymbol mit Details', NEW_TYPES.every((t) => plans[t].plan && plans[t].lines >= 2), NEW_TYPES.filter((t) => !(plans[t].plan && plans[t].lines >= 2)).join(','));
check('2D: Oberschrank gestrichelt, Fläche durchsichtig (Unterschränke bleiben sichtbar)', plans['kitchen-wall'].plan.dashed && plans['kitchen-wall'].plan.opacity === 0 && !plans['kitchen-base'].plan.dashed);
check('2D: Teppich liegt eine Ebene unter den Möbeln (kein Z-Fighting)', plans.rug.plan.fillY < plans['kitchen-island'].plan.fillY - 0.004 && plans.rug.plan.fillY > 0);
await view('3D');

// ---------- 3. Küche: Oberschrank (Montagehöhe, höhenabhängige Kollision), Bearbeiten, Farben, Gruppen
await openScene(page, kitchenScene());
const KW = 4.2, KL = 3.6;
check('Küchenszene: Zeile mit Oberschränken und Insel ohne Kollision', JSON.stringify(await severities()) === '{}' && (await notices()).length === 0, JSON.stringify(await notices()));
await selectByName('Oberschrank 1');
check('Oberschrank: Feld „Montagehöhe“ 1,45 m mit Hinweis zur Wandmontage', (await val('Montagehöhe')) === '1,45' && (await fp.textContent()).includes('Hängt an der Wand'));
await setIn('Montagehöhe', '0,5');
check('Montagehöhe nach unten begrenzt (1,00 m): Oberschrank bleibt über der Arbeitsplatte, keine Kollision', (await val('Montagehöhe')) === '1,00' && near((await info(await idOfType('kitchen-wall'))).y, 1) && (await notices()).length === 0, await val('Montagehöhe'));
await key('ControlOrMeta+z');
check('Undo: wieder 1,45 m', (await val('Montagehöhe')) === '1,45');
await setIn('Montagehöhe', '9');
check('Montagehöhe begrenzt: Oberkante bleibt unter der Decke (2,60 − 0,70 = 1,90 m)', (await val('Montagehöhe')) === '1,90', await val('Montagehöhe'));
await key('ControlOrMeta+z');
await setIn('X-Position', '0,9');
check('Oberschrank vor dem Hochschrank (gleiche Höhe): Kollision', (await severities())['Oberschrank 1'] === 'error' && (await severities())['Hochschrank'] === 'error', JSON.stringify(await severities()));
await key('ControlOrMeta+z');
check('Undo: Oberschrank wieder über dem Unterschrank, ohne Kollision', (await val('X-Position')) === '1,50' && JSON.stringify(await severities()) === '{}');

// Duplizieren, Kopieren/Einfügen
const before = (await listNames()).length;
await selectByName('Unterschrank 2');
await key('ControlOrMeta+d');
const dupId = await newestId();
check('Strg/⌘+D: Unterschrank dupliziert (gleicher Typ, gleiche Maße)', (await listNames()).length === before + 1 && (await info(dupId)).type === 'kitchen-base' && (await val('Breite')) === '0,60' && (await undoTitle()) === 'Möbel duplizieren rückgängig');
await key('ControlOrMeta+z');
await selectByName('Oberschrank 3');
await key('ControlOrMeta+c'); await key('ControlOrMeta+v');
const pasteId = await newestId();
check('Kopieren/Einfügen: Oberschrank mit Montagehöhe 1,45 m', (await listNames()).length === before + 1 && (await info(pasteId)).type === 'kitchen-wall' && near((await info(pasteId)).y, 1.45) && (await val('Montagehöhe')) === '1,45');
await key('ControlOrMeta+z');
check('Undo entfernt Kopien wieder', (await listNames()).length === before);

// Drehen
await selectByName('Kücheninsel');
await setIn('Rotation', '90');
const islandId = await idOfType('kitchen-island');
const island = await info(islandId);
check('Kücheninsel um 90° gedreht: Grundfläche gedreht', island.rot === 90 && near(island.size[0], 0.9) && near(island.size[2], 1.8), `${island.rot} ${island.size.map((v) => v.toFixed(2)).join('×')}`);
await key('ControlOrMeta+z');

// Farben
await selectByName('Spüle');
await fp.getByTestId('furniture-color-main').fill('#2f4f6f'); await settle();
await fp.getByTestId('furniture-color-wood').fill('#c9b28f'); await settle();
const sinkColors = await page.evaluate(() => {
  const out = new Set();
  window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureType === 'kitchen-sink') o.traverse((m) => m.isMesh && m.material?.color && out.add(`#${m.material.color.getHexString()}`)); });
  return [...out];
});
check('Spüle: Fronten- und Arbeitsplattenfarbe in 3D übernommen', sinkColors.includes('#2f4f6f') && sinkColors.includes('#c9b28f'), sinkColors.join(','));

// Gruppe
await selectByName('Unterschrank 1');
await selectByName('Spüle', true);
await page.getByTestId('group-furniture').click(); await settle();
check('Unterschrank und Spüle gruppiert', (await page.getByTestId('furniture-group-info').count()) >= 1 || (await page.getByTestId('ungroup-furniture').count()) === 1);
await page.keyboard.press('Escape'); await settle();

// 2D: Kücheninsel mit der Maus ziehen
await view('2D');
const islandBefore = (await info(islandId)).x;
// Neben der Pendelleuchte greifen (sie hängt über der Inselmitte und läge im Grundriss obenauf).
const a = await toScreen(1.7, 2.3, KW, KL); const b = await toScreen(2.0, 2.3, KW, KL);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 6 }); await page.mouse.move(b.x, b.y, { steps: 6 }); await settle(120);
await page.mouse.up(); await settle(300);
const islandAfter = (await info(islandId)).x;
check('2D: Kücheninsel ziehen = ein Schritt „Möbel verschieben“', Math.abs(islandAfter - islandBefore - 0.3) <= 0.06 && (await undoTitle()) === 'Möbel verschieben rückgängig', `${islandBefore} → ${islandAfter}`);
await key('ControlOrMeta+z');
await page.screenshot({ path: `${OUT}/04-kitchen-2d.png` });
await view('3D');

// Speichern, neu laden
await page.getByTestId('project-save').click(); await settle(400);
const kitchenStored = await stored('kueche');
const sinkStored = kitchenStored.plan.furniture.find((f) => f.type === 'kitchen-sink');
check('Gespeichert (Version 7): Küchenmöbel, Oberschrank-Höhe, Farben, Gruppe, Wandfliesen',
  kitchenStored.version === 7 && kitchenStored.plan.furniture.length === 11 && kitchenStored.plan.furniture.filter((f) => f.type === 'kitchen-wall').every((f) => f.elevation === 1.45) &&
  sinkStored.colors.main === '#2f4f6f' && sinkStored.colors.wood === '#c9b28f' && kitchenStored.plan.groups.length === 1 && kitchenStored.plan.design.wallFinishes.north === 'tiles');
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
check('Nach dem Speichern: kein Wiederherstellungsdialog', (await page.getByTestId('recovery-dialog').count()) === 0);
await page.getByTestId('projects-button').click(); await settle(300);
await page.locator('[data-project-id="kueche"]').getByTestId('project-open').click(); await settle(900);
const reloadedTypes = await page.evaluate(() => { const t = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureType && t.push(o.userData.furnitureType)); return t.sort(); });
check('Geladen: alle Küchenmöbel wieder in der Szene', reloadedTypes.length === 11 && KITCHEN.every((t) => reloadedTypes.includes(t)), reloadedTypes.join(','));

// Export
await page.getByTestId('export-button').click(); await page.getByTestId('export-dialog').waitFor(); await settle(200);
const png = await exportFile(page, 'export-plan-png');
const pngInfo = await analyzeImage(page, png.path);
check('Grundriss-PNG der Küche: erzeugt, weißer Hintergrund', png.name === 'Küche – Grundriss.png' && pngInfo.width > 1000 && pngInfo.corners.every((c) => c.every((v) => v === 255)), `${png.name} ${pngInfo.width}×${pngInfo.height}`);
fs.copyFileSync(png.path, `${OUT}/05-kitchen-plan.png`);
const shot3d = await exportFile(page, 'export-3d-png');
const shotInfo = await analyzeImage(page, shot3d.path);
check('3D-PNG der Küche: erzeugt, nicht leer', shotInfo.width > 800 && shotInfo.std > 10, `${shotInfo.width}×${shotInfo.height} σ ${shotInfo.std.toFixed(1)}`);
const pdf = await exportFile(page, 'export-pdf');
const pdfText = fs.readFileSync(pdf.path, 'latin1');
// WinAnsi: „ü“ steht als Byte 0xFC (latin1 gelesen „ü“) oder oktal maskiert.
const inPdf = (t) => pdfText.includes(t) || pdfText.includes(t.replace(/ü/g, '\\374'));
check('PDF: Küchenmöbel in der Möbelliste', ['Küchenoberschrank', 'Spülenschrank', 'Herd mit Backofen', 'Kücheninsel', 'Kühlschrank'].every(inPdf), 'Text im PDF');
const file = await exportFile(page, 'export-project');
const json = JSON.parse(fs.readFileSync(file.path, 'utf8'));
check('Projektdatei: Version 7 mit Küchenmöbeln, ohne Wiederherstellungsdaten', json.version === 7 && json.plan.furniture.length === 11 && !fs.readFileSync(file.path, 'utf8').includes('raumplaner-recovery'));
await page.keyboard.press('Escape'); await settle();

// ---------- 4. Bad: Badvorleger im Türschwenk, Pflanze auf dem Teppich, Wandfliesen
await openScene(page, bathScene());
check('Badszene ohne Kollision (Badvorleger im Türschwenk ist erlaubt)', JSON.stringify(await severities()) === '{}' && (await notices()).length === 0, JSON.stringify(await notices()));
await selectByName('Pflanze');
// Auf dem Teppich, aber außerhalb des Türschwenks (der beginnt bei z = 1,60 m).
await setIn('X-Position', '1,6'); await setIn('Z-Position', '1,42');
check('Pflanze auf dem Badvorleger: keine Kollision', JSON.stringify(await severities()) === '{}', JSON.stringify(await severities()));
await key('ControlOrMeta+z'); await key('ControlOrMeta+z');
await selectByName('WC');
await setIn('X-Position', '1,2'); await setIn('Z-Position', '2,0');
check('WC im Türschwenk: Kollision „door-swing“ (Badmöbel kollidieren normal)', (await notices()).includes('door-swing'), JSON.stringify(await notices()));
await key('ControlOrMeta+z'); await key('ControlOrMeta+z');
await page.keyboard.press('Escape'); await settle();
const finishPressed = await page.getByTestId('wall-finish').locator('[aria-pressed="true"], [aria-checked="true"]').textContent().catch(() => '');
check('Gestaltung: Wandoberfläche „Fliesen“ ausgewählt', finishPressed.includes('Fliesen'), finishPressed);
await page.screenshot({ path: `${OUT}/06-bath-3d.png` });

// ---------- 5. Wohnzimmer: Teppich unter Sofa und Couchtisch, Farbe, Fliesen per Oberfläche wählbar
await openScene(page, livingRug());
check('Teppich unter Sofa und Couchtisch: keine Kollision', JSON.stringify(await severities()) === '{}' && (await notices()).length === 0, JSON.stringify(await notices()));
const typeIds = { sofa: await idOfType('sofa'), rug: await idOfType('rug') };
const sofa = await info(typeIds.sofa);
check('Sofa steht auf dem Boden (nicht auf dem Teppich angehoben)', near(sofa.y, 0, 0.0005), `${sofa.y}`);
await view('2D');
await selectByName('Couchtisch');
const targets = await page.locator('[data-testid^="clearance-"][data-target]').evaluateAll((els) => els.map((e) => e.dataset.target));
check('Abstandsmaße des Couchtischs messen nicht bis zum Teppich', targets.length > 0 && !targets.includes(typeIds.rug), targets.join(','));
await selectByName('Teppich');
await fp.getByTestId('furniture-color-fabric').fill('#7a5c8e'); await settle();
await setIn('Breite', '9');
check('Teppich: Breite auf höchstens 4 m begrenzt', num(await val('Breite')) <= 4, await val('Breite'));
await key('ControlOrMeta+z');
await page.screenshot({ path: `${OUT}/07-living-2d.png` });
await view('3D');
await page.keyboard.press('Escape'); await settle();
await page.getByTestId('wall-finish').getByRole('button', { name: 'Fliesen' }).click(); await settle();
await page.getByTestId('project-save').click(); await settle(400);
const livingStored = await stored('wohnen-teppich');
check('Gespeichert: Teppichfarbe und Wandfliesen', livingStored.plan.furniture.find((f) => f.type === 'rug').colors.fabric === '#7a5c8e' && Object.values(livingStored.plan.design.wallFinishes).includes('tiles'), JSON.stringify(livingStored.plan.design.wallFinishes));
await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1200);
await page.screenshot({ path: `${OUT}/08-living-preview.png` });
await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(600);

// ---------- 6. Smartphone (390 px): Kategorien erreichbar, Küchenmöbel einfügen
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await mobile.newPage();
mp.on('pageerror', (e) => errors.push(String(e)));
await mp.goto(process.env.E2E_DEV_URL); await mp.waitForFunction(() => !!window.__PLANNER_R3F__); await mp.waitForTimeout(800);
await mp.getByTestId('menu-button').click(); await mp.waitForTimeout(500);
await mp.getByTestId('furniture-library-button').click(); await mp.getByTestId('furniture-library').waitFor(); await mp.waitForTimeout(400);
const dialogBox = await mp.getByTestId('furniture-library').boundingBox();
const tabBox = await mp.getByTestId('library-category-kitchen').boundingBox();
check('390 px: Bibliothek im Bildschirm, Kategorie „Küche“ sichtbar', dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 844 && tabBox.y + tabBox.height <= 844 && tabBox.x + tabBox.width <= 390, JSON.stringify({ dialogBox, tabBox }));
await mp.getByTestId('library-category-kitchen').tap(); await mp.waitForTimeout(300);
const mobileCards = await mp.getByTestId('furniture-library').locator('[data-testid^="library-item-"]').count();
await mp.getByTestId('library-item-kitchen-sink').tap();
await mp.getByTestId('furniture-library').waitFor({ state: 'detached' }); await mp.waitForTimeout(500);
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check('390 px: sieben Küchenmöbel, Spülenschrank eingefügt, kein horizontales Scrollen', mobileCards === 7 && (await mp.getByTestId('furniture-list-item').count()) === 1 && !overflow, `${mobileCards} Karten`);
await mp.screenshot({ path: `${OUT}/09-mobile.png` });
await mobile.close();

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
