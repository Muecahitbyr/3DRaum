import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { analyzeImage, exportFile } from '../lib/images.mjs';
import { addFurniture } from '../lib/planner.mjs';
import { openScene, polygonWalls, project } from '../lib/scenes.mjs';

/**
 * V1.1 Block A – Maße und Grundriss: Raumfläche/Umfang (live, alle Raumformen),
 * Öffnungsmaßketten im Grundriss (live beim Ziehen, Breite, Wandwechsel, Raumänderung),
 * Lagemaße der ausgewählten Öffnung mit direkter Eingabe (ein Verlaufsschritt), Durchgang
 * (anlegen, ziehen, löschen, Undo, 3D, Kollision, Speichern), L-Form-Hauptmaße, Export
 * (PNG/PDF mit Maßen und Fläche) und überdeckungsfreie Beschriftung auch auf dem Smartphone.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.0105) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

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
const shot = (n, p = page) => p.screenshot({ path: `${OUT}/${n}.png` });

const roomPanel = page.getByTestId('room-panel');
const props = page.getByTestId('opening-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const valueOf = async (panel, label) => num(await panel.getByLabel(label, { exact: true }).inputValue());
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const area = () => roomPanel.getByTestId('room-area').textContent();
const perimeter = () => roomPanel.getByTestId('room-perimeter').textContent();
/** Kettenbeschriftungen einer Wand in Leserichtung (sortiert nach Bildschirmlage). */
const chain = (wall) => page.locator(`[data-testid="opening-dimension-label"][data-wall="${wall}"]`).evaluateAll((els) =>
  els.map((e) => { const b = e.getBoundingClientRect(); return { text: e.textContent.trim(), x: b.x, y: b.y }; }).sort((a, b) => a.x - b.x || a.y - b.y).map((l) => l.text));
const measureCm = async (side) => num(await page.getByTestId(`opening-measure-${side}`).getAttribute('data-distance-cm'));
/**
 * Alle Maßbeschriftungen als gedrehte Rechtecke (Elementgröße + Drehung des Etiketts) –
 * keine darf eine andere überdecken. Bounding-Boxen wären bei schrägen Wänden zu groß.
 */
const labelOverlaps = (p = page) => p.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid="dimension-label"], [data-testid="opening-dimension-label"], [data-testid^="opening-measure-"]')];
  const boxes = els.map((e) => {
    const r = e.getBoundingClientRect();
    const m = /rotate\((-?[\d.]+)deg\)/.exec(e.parentElement?.style.transform ?? '');
    const a = m ? (Number(m[1]) * Math.PI) / 180 : 0;
    return { t: e.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2, u: [Math.cos(a), Math.sin(a)], hw: e.offsetWidth / 2, hh: e.offsetHeight / 2 };
  });
  const radius = (b, ax) => b.hw * Math.abs(b.u[0] * ax[0] + b.u[1] * ax[1]) + b.hh * Math.abs(-b.u[1] * ax[0] + b.u[0] * ax[1]);
  const hit = (a, b) => [a.u, [-a.u[1], a.u[0]], b.u, [-b.u[1], b.u[0]]].every((ax) => Math.abs((b.x - a.x) * ax[0] + (b.y - a.y) * ax[1]) < radius(a, ax) + radius(b, ax) - 0.5);
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) out.push(`${boxes[i].t}/${boxes[j].t}`);
  return { count: boxes.length, overlaps: out };
});
const roomInfo = () => page.evaluate(() => window.__PLANNER_R3F__().scene.getObjectByName('room').userData);
const toScreen = async (planX, planZ, y = 2.6) => {
  const { origin } = await roomInfo();
  return page.evaluate(({ x, z, y }) => {
    const s = window.__PLANNER_R3F__();
    const v = s.camera.position.clone().set(x, y, z).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, { x: planX - origin.x, z: planZ - origin.z, y });
};
async function drag(from, to, during) {
  const a = await toScreen(from.x, from.z);
  const b = await toScreen(to.x, to.z);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 }); await settle(150);
  const live = during ? await during() : undefined;
  await page.mouse.up(); await settle();
  return live;
}

// ---------- 1. Raumfläche und Umfang (aus der Kontur, live)
check('Rechteck 5 × 4: Grundfläche 20,00 m², Umfang 18,00 m', (await area()) === '20,00 m²' && (await perimeter()) === '18,00 m');
await setIn(roomPanel, 'Breite', '6');
check('Live: Breite 6 → 24,00 m², 20,00 m', (await area()) === '24,00 m²' && (await perimeter()) === '20,00 m');
await key('ControlOrMeta+z');
await roomPanel.getByTestId('room-shape').getByRole('button', { name: 'Frei', exact: true }).click(); await settle(500);
check('Freie Form mit diagonaler Wand: 18,88 m² (nicht Hülle 20 m²), Umfang 17,12 m', (await area()) === '18,88 m²' && (await perimeter()) === '17,12 m', `${await area()} / ${await perimeter()}`);
await roomPanel.getByTestId('room-shape').getByRole('button', { name: 'L-Form', exact: true }).click(); await settle(500);
check('L-Form aus 5 × 4: 17,00 m² und L-Hauptmaße im Bereich „Raum“', (await area()) === '17,00 m²' && (await roomPanel.getByTestId('l-shape-dimensions').count()) === 1);
await setIn(roomPanel, 'Ausschnitt Breite', '3');
check('L-Ausschnitt 3,00 m: Fläche live 15,50 m², Verlauf „Raummaße ändern“', (await area()) === '15,50 m²' && (await undoTitle()) === 'Raummaße ändern rückgängig');
await setIn(roomPanel, 'Ausschnitt Breite', '9');
check('L-Ausschnitt zu groß: auf Schenkel 20 cm begrenzt (4,80 m)', (await valueOf(roomPanel, 'Ausschnitt Breite')) === 4.8);
await toggle('2D');
await roomPanel.getByTestId('room-edit-toggle').click(); await settle(400);
{
  const box = await page.locator('[data-testid="room-corner"][data-wall-id="wall-4"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 15, { steps: 6 }); await page.mouse.up(); await settle();
}
check('L-Form frei bearbeitet (Ecke gezogen): Editor funktioniert, Hauptmaße ausgeblendet, Fläche aktualisiert', (await roomPanel.getByTestId('l-shape-dimensions').count()) === 0 && (await area()) !== '15,50 m²', await area());
await roomPanel.getByTestId('room-edit-toggle').click(); await settle(300);
await roomPanel.getByTestId('room-shape').getByRole('button', { name: 'Rechteck', exact: true }).click(); await settle(500);
await setIn(roomPanel, 'Breite', '5'); await setIn(roomPanel, 'Länge', '4');

// ---------- 2. Öffnungsmaßkette (2D, live)
await page.getByTestId('add-door').click(); await settle(); // Südwand mittig: 2,05 · 0,90 · 2,05
check('Tür an der Südwand: Kette 2,05 · 0,90 · 2,05', JSON.stringify(await chain('south')) === '["2,05","0,90","2,05"]', JSON.stringify(await chain('south')));
check('Gesamtmaß der Südwand bleibt beschriftet (5,00 m)', (await page.getByTestId('dimension-label').allTextContents()).filter((t) => t.trim() === '5,00 m').length === 2);
check('Ausgewählte Tür: Lagemaße im Raum 205 / 205 cm', (await measureCm('start')) === 205 && (await measureCm('end')) === 205);
await shot('01-tuer-kette');
const live = await drag({ x: 2.5, z: 4.07 }, { x: 1.2, z: 4.07 }, async () => ({ chain: await chain('south'), cm: await measureCm('start') }));
check('Ziehen: Kette und Lagemaße live (Tür links bei 0,75)', JSON.stringify(live.chain) === '["0,75","0,90","3,35"]' && live.cm === 75, JSON.stringify(live));
check('Ziehen: Sidebar zeigt Abstand von links/rechts', near(await valueOf(props, 'Abstand von links'), 0.75) && near(await valueOf(props, 'Abstand von rechts'), 3.35));
await setIn(props, 'Breite', '1');
check('Breite ändern: Kette 0,75 · 1,00 · 3,25 (linke Kante bleibt)', JSON.stringify(await chain('south')) === '["0,75","1,00","3,25"]', JSON.stringify(await chain('south')));
await props.getByLabel('Wand').selectOption('west'); await settle();
check('Wand wechseln: Kette wandert zur Westwand (von oben 0,75)', (await chain('south')).length === 0 && JSON.stringify(await chain('west')) === '["0,75","1,00","2,25"]', JSON.stringify(await chain('west')));
await setIn(roomPanel, 'Länge', '5');
check('Raumgeometrie ändern (Länge 5): Kette aktualisiert, Restmaß 3,25', (await chain('west')).at(-1) === '3,25', JSON.stringify(await chain('west')));
await key('ControlOrMeta+z');
await props.getByLabel('Wand').selectOption('south'); await settle();

// ---------- 3. Direkte Maßeingabe (Abstand zu einer Wandseite)
await page.getByTestId('opening-list-item').first().click(); await settle();
await page.getByTestId('opening-measure-start').click(); await settle(150);
await page.getByTestId('opening-measure-input').fill('80'); await page.getByTestId('opening-measure-input').press('Enter'); await settle();
check('„Abstand links: 80 cm“ im Grundriss: Tür verschoben, Sidebar 0,80 / 3,20', near(await valueOf(props, 'Abstand von links'), 0.8) && near(await valueOf(props, 'Abstand von rechts'), 3.2) && (await measureCm('start')) === 80);
check('Eingabe = ein Verlaufsschritt „Tür verschieben“', (await undoTitle()) === 'Tür verschieben rückgängig');
await key('ControlOrMeta+z');
check('Undo: Tür zurück (0,75)', near(await valueOf(props, 'Abstand von links'), 0.75));
await key('ControlOrMeta+y');
await page.getByTestId('opening-measure-end').click(); await settle(150);
await page.getByTestId('opening-measure-input').fill('50'); await page.getByTestId('opening-measure-input').press('Enter'); await settle();
check('„Abstand rechts: 50 cm“: Restabstand 0,50, links 3,50', near(await valueOf(props, 'Abstand von rechts'), 0.5) && near(await valueOf(props, 'Abstand von links'), 3.5));
await page.getByTestId('opening-measure-end').click(); await settle(150);
await page.getByTestId('opening-measure-input').fill('900'); await page.getByTestId('opening-measure-input').press('Enter'); await settle();
check('Zu großer Abstand: auf die Wand begrenzt (links 0, rechts 4,00)', near(await valueOf(props, 'Abstand von links'), 0) && near(await valueOf(props, 'Abstand von rechts'), 4));
await page.getByTestId('opening-measure-start').click(); await settle(150);
await page.getByTestId('opening-measure-input').fill('120'); await page.getByTestId('opening-measure-input').press('Escape'); await settle();
check('Esc bricht die Eingabe ab (keine Änderung)', near(await valueOf(props, 'Abstand von links'), 0));
await setIn(props, 'Abstand von rechts', '1');
check('Sidebar „Abstand von rechts“ 1,00: Lagemaß im Grundriss 100 cm', (await measureCm('end')) === 100 && near(await valueOf(props, 'Abstand von links'), 3));
// Andere Öffnungen: bestehende Warnlogik bleibt (Überschneidung wird gemeldet, nicht verhindert)
await page.getByTestId('add-window').click(); await settle();
await props.getByLabel('Wand').selectOption('south'); await settle();
await setIn(props, 'Abstand von links', '3,2');
check('Überschneidung mit der Tür: Warnung wie bisher', (await props.getByTestId('collision-notice').allTextContents()).some((t) => t.includes('Überschneidet sich')));
await page.getByTestId('delete-opening').click(); await settle();

// ---------- 4. Durchgang
await page.getByTestId('add-passage').click(); await settle();
check('Durchgang hinzugefügt: „Durchgang 1“ an der Ostwand, 1,00 × 2,10 m, Verlauf „Durchgang hinzufügen“',
  (await page.getByTestId('opening-name').textContent()).includes('Durchgang 1') && (await props.getByLabel('Wand').inputValue()) === 'east' && (await valueOf(props, 'Breite')) === 1 && (await valueOf(props, 'Höhe')) === 2.1 && (await undoTitle()) === 'Durchgang hinzufügen rückgängig');
check('Durchgang: keine Anschlag-, Richtungs-, Flügel- oder Brüstungsfelder', (await props.getByTestId('door-hinge').count()) === 0 && (await props.getByTestId('door-swing').count()) === 0 && (await props.getByTestId('window-sashes').count()) === 0 && (await props.getByLabel('Brüstungshöhe').count()) === 0);
const passageScene = await page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  let symbol = null; let id = null;
  s.scene.traverse((o) => { if (o.userData?.openingType === 'passage') { id = o.userData.openingId; symbol = !!o.getObjectByName('passage-plan-symbol'); } });
  return { id, symbol, arc: !!s.scene.getObjectByName(id)?.getObjectByName('door-arc') };
});
check('Durchgang im Grundriss: eigenes Symbol (Wandöffnung, kein Türbogen)', passageScene.symbol && !passageScene.arc, JSON.stringify(passageScene));
check('Durchgang: Kette an der Ostwand 1,50 · 1,00 · 1,50', JSON.stringify(await chain('east')) === '["1,50","1,00","1,50"]', JSON.stringify(await chain('east')));
await drag({ x: 5.07, z: 2 }, { x: 5.07, z: 1.1 });
check('Durchgang ziehen: von oben 0,60 (Kette live)', near(await valueOf(props, 'Abstand von oben'), 0.6) && (await chain('east'))[0] === '0,60' && (await undoTitle()) === 'Durchgang verschieben rückgängig', `${await valueOf(props, 'Abstand von oben')}`);
await shot('02-durchgang-2d');
// Kein Schwenkbereich: Sofa direkt davor → keine Kollision
const furnitureBefore = await page.getByTestId('furniture-list-item').count();
await addFurniture(page, 'armchair'); await settle();
const fp = page.getByTestId('furniture-properties');
await setIn(fp, 'X-Position', '4,5'); await setIn(fp, 'Z-Position', '1,1');
check('Sessel direkt vor dem Durchgang: keine Tür-Kollision', (await page.getByTestId('furniture-list-item').count()) === furnitureBefore + 1 && (await fp.getByTestId('collision-notice').count()) === 0, (await fp.getByTestId('collision-notice').allTextContents()).join(' | '));
await page.getByTestId('delete-furniture').click(); await settle();
await page.getByTestId('opening-list-item').filter({ hasText: 'Durchgang 1' }).click(); await settle();
await toggle('3D');
const passage3d = await page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  let id = null; s.scene.traverse((o) => { if (o.userData?.openingType === 'passage') id = o.userData.openingId; });
  const g = s.scene.getObjectByName(id);
  return { outline: !!g?.getObjectByName('passage-outline'), leaf: !!g?.getObjectByName('door-leaf'), glass: !!g?.getObjectByName('window-glass') };
});
check('3D: offene Durchgangsöffnung (kein Türblatt, kein Glas), ausgewählt umrandet', passage3d.outline && !passage3d.leaf && !passage3d.glass, JSON.stringify(passage3d));
await shot('03-durchgang-3d');
await toggle('2D');
await page.getByTestId('delete-opening').click(); await settle();
check('Durchgang löschen: Verlauf „Durchgang löschen“', (await page.getByTestId('opening-list-item').filter({ hasText: 'Durchgang' }).count()) === 0 && (await undoTitle()) === 'Durchgang löschen rückgängig');
await key('ControlOrMeta+z');
check('Undo stellt den Durchgang wieder her (gleiche Lage)', (await page.getByTestId('opening-list-item').filter({ hasText: 'Durchgang 1' }).count()) === 1 && (await chain('east'))[0] === '0,60');

// ---------- 5. Speichern, Projektdatei, Export (PNG, PDF)
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Maße A');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(300);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichert (Version 7) mit Durchgang', stored.version === 7 && stored.plan.openings.some((o) => o.type === 'passage' && o.wall === 'east' && o.offset === 0.6 && o.width === 1));
await page.getByTestId('opening-list-item').filter({ hasText: 'Tür 1' }).click(); await settle();
await page.evaluate(() => {
  window.__texts = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { window.__texts.push(String(text)); return original.call(this, text, ...rest); };
});
await page.getByTestId('export-button').click(); await page.getByTestId('export-dialog').waitFor(); await settle();
const projectFile = JSON.parse(fs.readFileSync((await exportFile(page, 'export-project')).path, 'utf8'));
check('Projektdatei: Version 7 mit Durchgang', projectFile.version === 7 && projectFile.plan.openings.some((o) => o.type === 'passage'));
const png = await exportFile(page, 'export-plan-png');
const texts = await page.evaluate(() => window.__texts);
check('Grundriss-PNG: Öffnungskette Südwand (3,00 · 1,00 · 1,00) und Ostwand (0,60 · 1,00)', ['3,00', '1,00', '0,60'].every((t) => texts.includes(t)), JSON.stringify(texts.filter((t) => /^\d+,\d\d$/.test(t))));
check('Grundriss-PNG: Wandmaße und Fläche/Umfang', texts.includes('5,00 m') && texts.includes('4,00 m') && texts.some((t) => t.includes('Grundfläche 20,00 m²') && t.includes('Umfang 18,00 m')), JSON.stringify(texts.filter((t) => t.includes('m'))));
const img = await analyzeImage(page, png.path, { colors: { selection: [37, 99, 235, 18] } });
check('Grundriss-PNG: weißer Rand, keine Auswahl-Markierung', img.corners.every((c) => c.every((v) => v === 255)) && img.counts.selection < 20, JSON.stringify({ corners: img.corners, sel: img.counts.selection }));
fs.copyFileSync(png.path, `${OUT}/grundriss.png`);
const pdf = await exportFile(page, 'export-pdf');
const pdfText = fs.readFileSync(pdf.path).toString('latin1');
/** Text so suchen, wie er im PDF-String steht (Klammern und Backslash maskiert). */
const inPdf = (t) => pdfText.includes(t.replace(/[()\\]/g, '\\$&'));
check('PDF: Grundfläche und Umfang in den Raumdaten', pdfText.includes('Grundfl') && pdfText.includes('20,00 m\xB2') && pdfText.includes('Umfang') && pdfText.includes('18,00 m'));
check('PDF: Tür mit Wand, Lage, Größe und Anschlag', inPdf('3,00 m von links (rechts 1,00 m)') && pdfText.includes('100 \xD7 210') && pdfText.includes('Anschlag'), '');
check('PDF: Durchgang mit Lage von oben', pdfText.includes('Durchgang 1') && inPdf('0,60 m von oben (unten 2,40 m)') && pdfText.includes('ohne T\xFCr'));
check('PDF: keine globalen X/Z-Mittelpunkte für Öffnungen (Tabellenkopf „Lage“)', inPdf('Lage (Abstand zur Wandecke)'));
fs.copyFileSync(pdf.path, `${OUT}/bericht.pdf`);
const shot3d = await exportFile(page, 'export-3d-png');
const img3d = await analyzeImage(page, shot3d.path, { colors: { selection: [37, 99, 235, 18] } });
check('3D-PNG bei ausgewählter Tür: keine blaue Auswahlfarbe im Bild', img3d.counts.selection < 50, JSON.stringify(img3d.counts));
await page.keyboard.press('Escape'); await settle();
check('Nach dem 3D-Export: Tür wieder ausgewählt, Plan gilt als gespeichert (kein neuer Schritt)', (await page.getByTestId('opening-name').textContent()).includes('Tür 1') && (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');

// ---------- 6. Überdeckungsfreie Maße (L-Raum mit mehreren Öffnungen, Diagonale)
const v6 = (p) => ({ ...p, version: 6 });
const lScene = v6(project('massketten-l', 'Maßketten L', {
  shape: 'l-shape', walls: polygonWalls([[0, 0], [6, 0], [6, 3], [3.5, 3], [3.5, 5], [0, 5]], 2.6),
  openings: [
    { id: 'opening-1', type: 'window', wall: 'wall-1', offset: 0.5, width: 1.6, height: 1.4, sillHeight: 0.8, sashes: 2 },
    { id: 'opening-2', type: 'window', wall: 'wall-1', offset: 3.8, width: 1.2, height: 1.4, sillHeight: 0.8, sashes: 1 },
    { id: 'opening-3', type: 'door', wall: 'wall-5', offset: 0.1, width: 0.9, height: 2.1, hinge: 'left', swing: 'inward' },
    { id: 'opening-4', type: 'window', wall: 'wall-3', offset: 0.6, width: 1.0, height: 1.2, sillHeight: 0.9, sashes: 1 },
    { id: 'opening-5', type: 'passage', wall: 'wall-6', offset: 1.5, width: 1.2, height: 2.1 },
  ],
}));
const freeScene = v6(project('massketten-frei', 'Maßketten frei', {
  shape: 'free', walls: polygonWalls([[0, 0], [5, 0], [5, 2.5], [3.5, 4], [0, 4]], 2.6),
  openings: [{ id: 'opening-1', type: 'window', wall: 'wall-3', offset: 0.4, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 1 }],
}));
await openScene(page, lScene); await toggle('2D');
let o = await labelOverlaps();
check('L-Raum (Desktop): alle Maße sichtbar und überdeckungsfrei', o.overlaps.length === 0 && o.count >= 6 + 13, `${o.count} Etiketten, ${o.overlaps.join(', ')}`);
check('L-Raum: Kette der Südwand mit kurzem Restmaß 0,10', JSON.stringify(await chain('wall-5')) === '["2,50","0,90","0,10"]', JSON.stringify(await chain('wall-5')));
await shot('04-l-raum');
await openScene(page, freeScene); await toggle('2D');
await page.getByTestId('opening-list-item').first().click(); await settle();
const diag = await chain('wall-3');
check('Diagonale Wand: Kette entlang der Wand (0,40 · 1,20 · 0,52)', diag.length === 3 && diag.includes('1,20') && diag.includes('0,40') && diag.includes('0,52'), JSON.stringify(diag));
const diagCm = [Math.round(await measureCm('start')), Math.round(await measureCm('end'))];
check('Diagonale Wand: Lagemaße der Auswahl 40 / 52 cm (entlang der Wand)', diagCm.includes(40) && diagCm.includes(52), JSON.stringify(diagCm));
o = await labelOverlaps();
check('Diagonale Wand: keine Überdeckung (inkl. Auswahlmaße)', o.overlaps.length === 0, o.overlaps.join(', '));
await shot('05-diagonal');

// ---------- 7. Smartphone (375 px): Maße im Bild, keine Überdeckung
const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const mp = await phone.newPage();
await mp.goto(process.env.E2E_DEV_URL);
await mp.waitForFunction(() => !!window.__PLANNER_R3F__); await mp.waitForTimeout(800);
for (const [name, scene] of [['l', lScene], ['frei', freeScene]]) {
  await openScene(mp, scene);
  await mp.getByRole('button', { name: '2D', exact: true }).click(); await mp.waitForTimeout(900);
  const res = await labelOverlaps(mp);
  const inView = await mp.evaluate(() => {
    const c = document.querySelector('canvas').getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="dimension-label"]')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1; });
  });
  check(`Smartphone ${name}: Wandmaße im Bild, Beschriftungen überdeckungsfrei`, inView && res.overlaps.length === 0, `${res.count} Etiketten, ${res.overlaps.join(', ')}`);
  await shot(`06-smartphone-${name}`, mp);
}
await phone.close();

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
