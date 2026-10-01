import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.002) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));
const de = (v) => v.toFixed(2).replace('.', ',');

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const ready = async () => { await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(600); };
await page.goto(process.env.E2E_DEV_URL); await ready();

// Erwarteter Katalog (Label, Standard B×T×H, Grenzen) – laut Anforderung/Planung
const CATALOG = {
  sofa: ['Sofa', [2, 0.9, 0.85], [[0.8, 4], [0.6, 1.8], [0.5, 1.3]]],
  armchair: ['Sessel', [0.85, 0.85, 0.85], [[0.6, 1.3], [0.6, 1.1], [0.6, 1.2]]],
  'coffee-table': ['Couchtisch', [1.1, 0.6, 0.45], [[0.4, 1.8], [0.4, 1.2], [0.3, 0.6]]],
  'tv-board': ['TV-Board', [1.8, 0.4, 0.5], [[0.8, 3], [0.3, 0.6], [0.3, 0.8]]],
  shelf: ['Regal', [0.8, 0.35, 1.8], [[0.4, 3], [0.25, 0.6], [0.6, 2.5]]],
  bed: ['Einzelbett', [2, 0.9, 0.5], [[0.8, 3], [0.6, 2.4], [0.2, 1.4]]],
  'double-bed': ['Doppelbett', [2.1, 1.8, 0.5], [[1.9, 2.4], [1.2, 2.2], [0.25, 1.2]]],
  wardrobe: ['Kleiderschrank', [1.5, 0.6, 2], [[0.3, 5], [0.3, 1.2], [0.5, 3]]],
  dresser: ['Kommode', [1, 0.45, 0.85], [[0.4, 2.2], [0.3, 0.6], [0.5, 1.3]]],
  nightstand: ['Nachttisch', [0.45, 0.4, 0.55], [[0.3, 0.7], [0.3, 0.55], [0.35, 0.8]]],
  table: ['Esstisch', [1.4, 0.8, 0.75], [[0.4, 4], [0.4, 2], [0.4, 1.2]]],
  chair: ['Stuhl', [0.45, 0.52, 0.9], [[0.38, 0.6], [0.4, 0.65], [0.75, 1.1]]],
  sideboard: ['Sideboard', [1.6, 0.45, 0.8], [[0.8, 2.6], [0.35, 0.6], [0.6, 1.1]]],
  desk: ['Schreibtisch', [1.4, 0.7, 0.75], [[0.8, 2.4], [0.5, 1], [0.6, 0.9]]],
  'office-chair': ['Bürostuhl', [0.65, 0.65, 1.1], [[0.5, 0.8], [0.5, 0.8], [0.85, 1.35]]],
};
const TYPES = Object.keys(CATALOG);
// Lampen (eigene Kategorie; eigene Tests in lamps.mjs)
const LAMP_TYPES = ['ceiling-light', 'pendant-light', 'floor-lamp', 'table-lamp'];
const ALL_TYPES = [...TYPES, ...LAMP_TYPES];
const CATEGORY_TYPES = {
  living: ['sofa', 'armchair', 'coffee-table', 'tv-board', 'shelf'],
  bedroom: ['bed', 'double-bed', 'wardrobe', 'dresser', 'nightstand'],
  dining: ['table', 'chair', 'sideboard'],
  office: ['desk', 'office-chair', 'shelf'],
};

const lib = page.getByTestId('furniture-library');
const fp = page.getByTestId('furniture-properties');
const room = page.getByRole('region', { name: 'Raummaße' });
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(60); };
const val = (label) => fp.getByLabel(label, { exact: true }).inputValue();
const cardTypes = () => lib.locator('[data-testid^="library-item-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('library-item-', '')));
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const openLibrary = async () => { await page.getByTestId('furniture-library-button').click(); await lib.waitFor(); await settle(); };
const search = async (text) => { await lib.getByTestId('library-search').fill(text); await settle(80); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(700); };
const selectByName = async (name) => { await page.getByTestId('furniture-list-item').filter({ hasText: name }).first().click(); await settle(); };
const notices = () => page.getByTestId('collision-notice').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), rule: e.dataset.rule })));
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const lastId = () => page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && (id = o.userData.furnitureId)); return id; });

/** Welt-AABB aller Modellteile (ohne Auswahl-/Linien-Hilfen) + Anzahl der Bauteile + 2D-Symbol. */
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
  return { size: box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] : null, meshes, lines, plan: !!g.getObjectByName('furniture-plan-symbol'), rotY: g.rotation.y };
}, id);
const sizeOk = (i, [w, d, h], tol = 0.002) => i.size && near(i.size[0], w, tol) && near(i.size[1], h, tol) && near(i.size[2], d, tol);

// Großer Raum für alle 15 Möbel (Rasteraufstellung ohne Überschneidungen), 3 m hoch für Maximalhöhen
await setIn(room, 'Breite', '12'); await setIn(room, 'Länge', '10'); await setIn(room, 'Höhe', '3');

// ---------- 1. Bibliothek: Aufbau, Kategorien, Vorschau ----------
check('Sidebar: ein Button „Möbel hinzufügen“ statt Einzel-Buttons', (await page.getByTestId('furniture-library-button').textContent()).includes('Möbel hinzufügen') && (await page.locator('[data-testid^="add-furniture-"]').count()) === 0);
await openLibrary();
check('Bibliothek öffnet, Suchfeld hat den Fokus', (await lib.count()) === 1 && (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'library-search');
check('„Alle“: 19 Objekte (15 Möbel + 4 Lampen), jedes genau einmal (Regal trotz zwei Kategorien)', sameSet(await cardTypes(), ALL_TYPES) && (await cardTypes()).length === 19);
for (const [id, types] of Object.entries(CATEGORY_TYPES)) {
  await lib.getByTestId(`library-category-${id}`).click(); await settle(80);
  const label = (await lib.getByTestId(`library-category-${id}`).textContent()).trim();
  check(`Kategorie ${label}: richtige Möbel`, sameSet(await cardTypes(), types) && (await lib.getByTestId(`library-category-${id}`).getAttribute('aria-selected')) === 'true', (await cardTypes()).join(','));
}
check('Kategorien mit Anzahl (Alle 19, Wohnzimmer 5, Schlafzimmer 5, Esszimmer 3, Büro 3, Lampen 4)',
  JSON.stringify(await lib.locator('[role="tab"]').allTextContents()) === JSON.stringify(['Alle19', 'Wohnzimmer5', 'Schlafzimmer5', 'Esszimmer3', 'Büro3', 'Lampen4']));
await lib.getByTestId('library-category-all').click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid="library-thumbnail"]').length === 19, null, { timeout: 20000 }).catch(() => {});
const thumbs = await lib.getByTestId('library-thumbnail').evaluateAll(async (imgs) => Promise.all(imgs.map(async (img) => {
  await img.decode().catch(() => {});
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let filled = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 10) filled++;
  return { src: img.src.slice(0, 22), coverage: filled / (data.length / 4) };
})));
check('Jede Karte hat ein eigenes 3D-Vorschaubild (nicht leer)', thumbs.length === 19 && thumbs.every((t) => t.src === 'data:image/png;base64,' && t.coverage > 0.03), thumbs.map((t) => t.coverage.toFixed(2)).join(' '));
check('Karten zeigen Name und Standardmaße', (await lib.getByTestId('library-item-double-bed').textContent()).includes('Doppelbett') && (await lib.getByTestId('library-item-double-bed').textContent()).includes('2,10 × 1,80 × 0,50 m'));
await shot('library-all');

// ---------- 2. Suche ----------
await lib.getByTestId('library-category-office').click();
await search('Schrank');
check('Suche „Schrank“: Kleiderschrank, TV-Board, Kommode, Nachttisch, Sideboard', sameSet(await cardTypes(), ['wardrobe', 'tv-board', 'dresser', 'nightstand', 'sideboard']), (await cardTypes()).join(','));
check('Suche wechselt automatisch zu „Alle“', (await lib.getByTestId('library-category-all').getAttribute('aria-selected')) === 'true');
await shot('library-search');
await search('stuhl'); check('Suche „stuhl“: Stuhl und Bürostuhl', sameSet(await cardTypes(), ['chair', 'office-chair']));
await search('BÜRO'); check('Suche „BÜRO“ (Kategorie, Großschreibung): Büromöbel', sameSet(await cardTypes(), ['desk', 'office-chair', 'shelf']));
await search('buro'); check('Suche ohne Umlaut „buro“ findet dasselbe', sameSet(await cardTypes(), ['desk', 'office-chair', 'shelf']));
await search('bett'); check('Suche „bett“: Einzel- und Doppelbett', sameSet(await cardTypes(), ['bed', 'double-bed']));
await search('couch tisch'); check('Mehrere Wörter „couch tisch“: Couchtisch', sameSet(await cardTypes(), ['coffee-table']));
await search('Hängematte');
check('Keine Treffer: verständlicher Hinweis', (await cardTypes()).length === 0 && (await lib.getByTestId('library-empty').textContent()).includes('Keine Möbel gefunden für „Hängematte“'));
await search('');
check('Suche leeren: wieder alle 19', (await cardTypes()).length === 19);
await page.keyboard.press('Escape'); await settle();
check('Esc schließt die Bibliothek', (await lib.count()) === 0);

// ---------- 3. Alle 15 Möbel hinzufügen ----------
const ids = {};
for (const [index, type] of TYPES.entries()) {
  const [label, [w, d, h]] = CATALOG[type];
  await addFurniture(page, type);
  ids[type] = await lastId();
  const name = await val('Name');
  // V1.1: Neue Möbel stehen auf dem nächsten freien Platz um die Raummitte (vorher immer exakt mittig,
  // auch auf bereits belegter Fläche) – geprüft wird „frei“ statt „mittig“.
  const marked = await page.locator('[data-testid="furniture-list-item"] [data-severity]').count();
  check(`${label}: hinzugefügt, ausgewählt, auf freiem Platz, Standardmaße`,
    name === `${label} 1` && (await fp.getByTestId('furniture-type').textContent()).includes(label) &&
    (await val('Breite')) === de(w) && (await val('Tiefe')) === de(d) && (await val('Höhe')) === de(h) &&
    marked === 0 && (index > 0 || ((await val('X-Position')) === '6,00' && (await val('Z-Position')) === '5,00')),
    `${name} ${await val('Breite')}×${await val('Tiefe')}×${await val('Höhe')} @ ${await val('X-Position')}/${await val('Z-Position')}, ${marked} markiert`);
  const i = await info(ids[type]);
  check(`${label}: 3D-Modell exakt in den Außenmaßen, aus ${i.meshes} Bauteilen`, sizeOk(i, [w, d, h]) && i.meshes >= 3, i.size.map((v) => v.toFixed(3)).join(' × '));
  // Rasteraufstellung 5 × 3
  await setIn(fp, 'X-Position', de(1.3 + (index % 5) * 2.3)); await setIn(fp, 'Z-Position', de(1.5 + Math.floor(index / 5) * 3));
}
check('Liste enthält 15 Möbel', (await page.getByTestId('furniture-list-item').count()) === 15);
check('Rasteraufstellung ohne Kollisionen', (await page.locator('[data-testid="furniture-list-item"] [data-severity]').count()) === 0);
await page.evaluate(() => (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(1.5, 12, 11); s.invalidate(); })()); await settle(900);
await shot('all-furniture-3d');

// ---------- 4. Maße: Grenzen und Modelle bei Minimal-/Maximalmaßen ----------
for (const type of TYPES) {
  const [label, def, [[wMin, wMax], [dMin, dMax], [hMin, hMax]]] = CATALOG[type];
  await selectByName(`${label} 1`);
  await setIn(fp, 'Breite', '99'); await setIn(fp, 'Tiefe', '99'); await setIn(fp, 'Höhe', '99');
  const maxVals = [num(await val('Breite')), num(await val('Tiefe')), num(await val('Höhe'))];
  const maxInfo = await info(ids[type]);
  await setIn(fp, 'Breite', '0,01'); await setIn(fp, 'Tiefe', '0,01'); await setIn(fp, 'Höhe', '0,01');
  const minVals = [num(await val('Breite')), num(await val('Tiefe')), num(await val('Höhe'))];
  const minInfo = await info(ids[type]);
  check(`${label}: Grenzen ${de(wMin)}–${de(wMax)} × ${de(dMin)}–${de(dMax)} × ${de(hMin)}–${de(hMax)} m`,
    JSON.stringify(maxVals) === JSON.stringify([wMax, dMax, hMax]) && JSON.stringify(minVals) === JSON.stringify([wMin, dMin, hMin]),
    `max ${maxVals.join('/')} · min ${minVals.join('/')}`);
  check(`${label}: Modell bei Min- und Maxmaßen exakt`, sizeOk(maxInfo, maxVals) && sizeOk(minInfo, minVals),
    `max ${maxInfo.size.map((v) => v.toFixed(3)).join('×')} · min ${minInfo.size.map((v) => v.toFixed(3)).join('×')}`);
  check(`${label}: Standard < Grenzen sinnvoll`, def.every((v, k) => v > [wMin, dMin, hMin][k] && v < [wMax, dMax, hMax][k]));
  await setIn(fp, 'Breite', de(def[0])); await setIn(fp, 'Tiefe', de(def[1])); await setIn(fp, 'Höhe', de(def[2]));
}

// ---------- 5. 2D: Grundriss-Symbole und Piktogramme ----------
await toggle('2D');
for (const type of TYPES) {
  const i = await info(ids[type]);
  check(`${CATALOG[type][0]}: 2D-Symbol mit Umriss und Details, Grundfläche exakt`, i.plan && i.lines >= 2 && near(i.size[0], CATALOG[type][1][0], 0.002) && near(i.size[2], CATALOG[type][1][1], 0.002), `${i.lines} Linien`);
}
check('Listen-Piktogramme für alle Typen', (await page.locator('[data-testid="furniture-list-item"] svg path').count()) >= 15 * 2);
await shot('all-furniture-2d');

// ---------- 6. Drag & Drop, Snap, Rotation mit neuen Möbeln ----------
const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__(); const v = s.camera.position.clone().set(x, 0.02, z).project(s.camera); const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - 6, z: z - 5 });
const pos = async () => ({ x: num(await val('X-Position')), z: num(await val('Z-Position')) });
async function drag(to) {
  const p = await pos(); const a = await toScreen(p.x, p.z); const b = await toScreen(to.x, to.z);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await settle(100); await page.mouse.up(); await settle(200);
}
await selectByName('Bürostuhl 1');
await drag({ x: 5.2, z: 8.7 });
let p = await pos();
check('Drag & Drop: Bürostuhl verschoben', Math.abs(p.x - 5.2) < 0.02 && Math.abs(p.z - 8.7) < 0.02, `${p.x}/${p.z}`);
check('Drag = ein Verlaufsschritt „Möbel verschieben“', (await undoTitle()) === 'Möbel verschieben rückgängig');
await selectByName('Sideboard 1');
await drag({ x: 0.83, z: 7.5 });
check('Snap: Sideboard rastet an der Westwand ein (0,80)', (await pos()).x === 0.8, `${(await pos()).x}`);
await selectByName('TV-Board 1');
{
  const h = await page.getByTestId('rotation-handle').boundingBox(); const q = await pos(); const c = await toScreen(q.x, q.z);
  const hc = { x: h.x + h.width / 2, y: h.y + h.height / 2 }; const r = Math.hypot(hc.x - c.x, hc.y - c.y);
  await page.mouse.move(hc.x, hc.y); await page.mouse.down();
  for (let deg = 10; deg <= 90; deg += 10) await page.mouse.move(c.x + r * Math.sin((deg * Math.PI) / 180), c.y - r * Math.cos((deg * Math.PI) / 180));
  await page.mouse.up(); await settle(200);
}
let i = await info(ids['tv-board']);
check('Rotation über Handle: TV-Board 90°, Grundfläche gedreht', (await val('Rotation')) === '90' && near(i.size[0], 0.4) && near(i.size[2], 1.8), `${await val('Rotation')}° ${i.size[0].toFixed(2)}×${i.size[2].toFixed(2)}`);
await shot('drag-rotate-2d');

// ---------- 7. Kollisionen mit neuen Möbeln ----------
await selectByName('Stuhl 1');
await setIn(fp, 'X-Position', de(1.3 + 3 * 2.3)); await setIn(fp, 'Z-Position', de(7.5 + 0.35)); // vor den Schreibtisch
let n = await notices();
check('Kollision Stuhl ↔ Schreibtisch erkannt', n.some((m) => m.rule === 'furniture-overlap' && m.text.includes('Schreibtisch 1')), JSON.stringify(n));
await setIn(fp, 'Z-Position', de(7.5 + 0.61));
check('Stuhl direkt an der Tischkante (berührt nur): keine Kollision', (await notices()).length === 0, JSON.stringify(await notices()));
await page.getByTestId('add-door').click(); await settle(); // Südwand mittig: 5,55–6,45
await selectByName('Nachttisch 1');
await setIn(fp, 'X-Position', '6,2'); await setIn(fp, 'Z-Position', '9,6');
check('Nachttisch im Tür-Schwenkbereich: Warnung', (await notices()).some((m) => m.rule === 'door-swing'));
await page.getByTestId('add-window').click(); await settle(); // Nordwand mittig: 5,40–6,60, Brüstung 0,90
await selectByName('Regal 1'); await setIn(fp, 'X-Position', '6'); await setIn(fp, 'Z-Position', '0,18');
check('Hohes Regal vor dem Fenster: Hinweis', (await notices()).some((m) => m.rule === 'window-blocked'));
await selectByName('TV-Board 1'); await setIn(fp, 'Rotation', '0'); await setIn(fp, 'X-Position', '6'); await setIn(fp, 'Z-Position', '0,6');
check('Niedriges TV-Board (0,50 m) vor dem Fenster: kein Fenster-Hinweis', !(await notices()).some((m) => m.rule === 'window-blocked'));

// ---------- 8. Undo/Redo ----------
await addFurniture(page, 'armchair');
check('Hinzufügen aus der Bibliothek = „Möbel hinzufügen“', (await undoTitle()) === 'Möbel hinzufügen rückgängig' && (await page.getByTestId('furniture-list-item').count()) === 16);
await page.getByTestId('history-undo').click(); await settle();
check('Undo entfernt den Sessel wieder', (await page.getByTestId('furniture-list-item').count()) === 15);
await page.getByTestId('history-redo').click(); await settle();
check('Redo fügt ihn wieder hinzu (Sessel 2)', (await page.getByTestId('furniture-list-item').filter({ hasText: 'Sessel 2' }).count()) === 1);

// ---------- 9. Speichern und Laden ----------
await toggle('3D');
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Bibliothek');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichert: 16 Möbel mit allen neuen Typen', stored.plan.furniture.length === 16 && TYPES.every((t) => stored.plan.furniture.some((f) => f.type === t)));
await page.reload(); await ready();
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Bibliothek' }).getByTestId('project-open').click(); await settle(600);
check('Geladen: 16 Möbel', (await page.getByTestId('furniture-list-item').count()) === 16);
const reloaded = await page.evaluate(() => { const out = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureType && out.push(o.userData.furnitureType)); return out; });
check('Alle Typen wieder in der Szene', TYPES.every((t) => reloaded.includes(t)));
await selectByName('TV-Board 1');
check('TV-Board mit Position/Rotation wiederhergestellt', (await val('X-Position')) === '6,00' && (await val('Rotation')) === '0' && (await val('Z-Position')) === '0,60');
i = await info(await page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureType === 'double-bed' && (id = o.name)); return id; }));
check('Doppelbett-Modell nach dem Laden exakt', sizeOk(i, [2.1, 1.8, 0.5]));

// ---------- 10. Alte Projekte ----------
await page.evaluate(() => localStorage.setItem('raumplaner:project:alt-moebel', JSON.stringify({
  format: 'raumplaner-project', version: 1, id: 'alt-moebel', name: 'Alte Möbel', createdAt: '2026-01-05T08:00:00.000Z', updatedAt: '2026-01-05T08:00:00.000Z',
  plan: { dimensions: { width: 6, length: 5, height: 2.5 }, openings: [], furniture: [
    { id: 'furniture-1', type: 'bed', name: 'Bett 1', width: 2, depth: 1.4, height: 0.45, position: { x: 1.2, z: 1 }, rotationDeg: 0 },
    { id: 'furniture-2', type: 'wardrobe', name: 'Schrank 1', width: 1.5, depth: 0.6, height: 2, position: { x: 4.5, z: 0.4 }, rotationDeg: 0 },
    { id: 'furniture-3', type: 'sofa', name: 'Sofa 1', width: 2, depth: 0.9, height: 0.85, position: { x: 1.5, z: 4.4 }, rotationDeg: 180 },
    { id: 'furniture-4', type: 'table', name: 'Tisch 1', width: 1.4, depth: 0.8, height: 0.75, position: { x: 4.2, z: 3 }, rotationDeg: 90 },
  ] },
})));
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Alte Möbel' }).getByTestId('project-open').click(); await settle(600);
check('Altes Projekt öffnet ohne Hinweis', (await page.getByTestId('project-notice').textContent()) === '„Alte Möbel“ geöffnet.');
check('Alte Namen bleiben erhalten', JSON.stringify(await page.getByTestId('furniture-list-item').allTextContents()) === JSON.stringify(['Bett 1Einzelbett', 'Schrank 1Kleiderschrank', 'Sofa 1', 'Tisch 1Esstisch']), JSON.stringify(await page.getByTestId('furniture-list-item').allTextContents()));
await selectByName('Bett 1');
check('Alte Maße unverändert (Bett 2,00 × 1,40 × 0,45)', (await val('Breite')) === '2,00' && (await val('Tiefe')) === '1,40' && (await val('Höhe')) === '0,45');
i = await info(await page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureType === 'table' && (id = o.name)); return id; }));
check('Alter Tisch (90°) korrekt dargestellt', near(i.size[0], 0.8) && near(i.size[2], 1.4));
await addFurniture(page, 'bed');
check('Neues Einzelbett im alten Projekt: „Einzelbett 2“', (await val('Name')) === 'Einzelbett 2');

check('Möbelliste: lange Namen einzeilig', await page.getByTestId('furniture-list-item').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height <= 36)));
check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
