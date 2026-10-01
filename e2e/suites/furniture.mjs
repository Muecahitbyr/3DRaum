import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 300) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

const props = page.getByTestId('furniture-properties');
const field = (label) => props.getByLabel(label, { exact: true });
const val = (label) => field(label).inputValue();
const setField = async (label, text) => { const i = field(label); await i.click(); await i.fill(text); await i.press('Enter'); await settle(120); };
const add = async (type) => { await addFurniture(page, type); await settle(200); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const listItems = () => page.getByTestId('furniture-list-item');
const selectedFurniture = async () => ((await props.count()) ? await field('Name').inputValue() : null);
const setRoom = async (idx, text) => { const i = page.locator('aside input').nth(idx); await i.click(); await i.fill(text); await i.press('Enter'); await settle(200); };

/** Szene-Infos zu einem Möbelstück: Transformation, Welt-AABB des Modells, Darstellung. */
const info = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const g = s.scene.getObjectByName(id);
  if (!g) return null;
  g.updateWorldMatrix(true, true);
  let box = null, meshes = 0;
  g.traverse((m) => {
    if (!m.isMesh || m.name === 'furniture-bounds') return;
    if (m.isLine2 || m.isLineSegments2) return; // Linien (Auswahl-Umrandung, Grundriss) sind keine Modellteile
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    box = box ? box.union(b) : b; meshes++;
  });
  const bounds = g.getObjectByName('furniture-bounds');
  const plan = g.getObjectByName('furniture-plan-symbol');
  const planFill = plan?.children.find((c) => c.isMesh);
  return {
    type: g.userData.furnitureType,
    pos: [g.position.x, g.position.z], rotY: g.rotation.y,
    size: box ? [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z] : null,
    meshes, has3D: !!bounds, hasPlan: !!plan,
    selected3D: !!bounds && bounds.children.length > 0,
    planFill: planFill ? planFill.material.color.getHexString() : null,
  };
}, id);
const ids = () => page.evaluate(() => { const out = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && out.push(o.userData.furnitureId)); return out; });
const screenOf = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const g = s.scene.getObjectByName(id);
  const bounds = g.getObjectByName('furniture-bounds');
  const top = bounds ? bounds.geometry.parameters.height * 0.9 : 0.02;
  const v = g.localToWorld(s.camera.position.clone().set(0, top, 0)).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, id);

// ---------- 1. Alle vier Möbel hinzufügen ----------
const defaults = {
  bed: ['Einzelbett 1', '2,00', '0,90', '0,50', 5],
  wardrobe: ['Kleiderschrank 1', '1,50', '0,60', '2,00', 8],
  sofa: ['Sofa 1', '2,00', '0,90', '0,85', 14],
  table: ['Esstisch 1', '1,40', '0,80', '0,75', 5],
};
const idOf = {};
for (const [type, [name, w, d, h, minMeshes]] of Object.entries(defaults)) {
  await add(type);
  const all = await ids();
  idOf[type] = all[all.length - 1];
  const i = await info(idOf[type]);
  check(`${name}: hinzugefügt & ausgewählt`, (await selectedFurniture()) === name && (await props.getByTestId('furniture-type').textContent()).includes(name.split(' ')[0]));
  check(`${name}: Standardmaße ${w} × ${d} × ${h}`, (await val('Breite')) === w && (await val('Tiefe')) === d && (await val('Höhe')) === h);
  // V1.1: Das erste Möbel steht in der Raummitte, jedes weitere auf dem nächsten freien Platz
  // (vorher lagen alle exakt übereinander in der Mitte).
  if (Object.keys(idOf).length === 1) {
    check(`${name}: mittig im Raum (2,50 / 2,00, 0°)`, (await val('X-Position')) === '2,50' && (await val('Z-Position')) === '2,00' && (await val('Rotation')) === '0' && near(i.pos[0], 0) && near(i.pos[1], 0));
  } else {
    const marked = await page.locator('[data-testid="furniture-list-item"] [data-severity]').count();
    check(`${name}: auf freiem Platz (keine Kollision mit den übrigen Möbeln, 0°)`, marked === 0 && (await val('Rotation')) === '0', `${await val('X-Position')} / ${await val('Z-Position')}, ${marked} markiert`);
  }
  const [W, D, H] = [w, d, h].map((x) => Number(x.replace(',', '.')));
  check(`${name}: 3D-Modell entspricht exakt den Außenmaßen (B×H×T)`, near(i.size[0], W, 0.002) && near(i.size[1], H, 0.002) && near(i.size[2], D, 0.002), i.size.map((x) => x.toFixed(3)).join(' × '));
  check(`${name}: erkennbares Modell aus ≥ ${minMeshes} Bauteilen`, i.meshes >= minMeshes, `${i.meshes} Bauteile`);
}
check('Liste enthält alle vier Möbel', (await listItems().count()) === 4);

// Verteilen, damit alle sichtbar und einzeln anklickbar sind
const layout = { bed: ['1,2', '1,1', '0'], wardrobe: ['4', '0,45', '0'], sofa: ['1,5', '3,4', '180'], table: ['3,6', '2,5', '90'] };
for (const [type, [x, z, r]] of Object.entries(layout)) {
  await listItems().nth(Object.keys(layout).indexOf(type)).click(); await settle(100);
  await setField('X-Position', x); await setField('Z-Position', z); await setField('Rotation', r);
}

// ---------- 2. Maße ändern ----------
await listItems().nth(0).click(); await settle(100);
await setField('Breite', '1,8'); await setField('Tiefe', '1,4'); await setField('Höhe', '0,45');
let bed = await info(idOf.bed);
check('Bett-Maße geändert → Modell 1,80 × 0,45 × 1,40', near(bed.size[0], 1.8, 0.02) && near(bed.size[1], 0.45, 0.02) && near(bed.size[2], 1.4, 0.03), bed.size.map((x) => x.toFixed(3)).join(' × '));
await setField('Breite', '10');
check('Breite > Maximum wird begrenzt (Bett max. 3,00)', (await val('Breite')) === '3,00');
await setField('Breite', '1,8');
await setField('Höhe', '9');
check('Höhe durch Katalog/Raumhöhe begrenzt', (await val('Höhe')) === '1,40');
await setField('Höhe', '0,45');
await field('Name').fill('Mein Bett'); await settle(100);
check('Name änderbar, Liste aktualisiert', (await listItems().nth(0).textContent()).includes('Mein Bett'));

// ---------- 3. Position ändern ----------
await setField('X-Position', '1'); await setField('Z-Position', '1,5');
bed = await info(idOf.bed);
check('Position X 1,00 / Z 1,50 → Welt (−1,50 / −0,50)', near(bed.pos[0], -1.5) && near(bed.pos[1], -0.5), bed.pos.map((x) => x.toFixed(3)).join(', '));
await setField('X-Position', '7');
check('X außerhalb des Raums: Bett (1,80 m) bleibt vollständig im Raum (5,00 − 0,90 = 4,10)', (await val('X-Position')) === '4,10');
await setField('X-Position', '1,2'); await setField('Z-Position', '1,1');

// ---------- 4. Rotation ändern ----------
await setField('Rotation', '90');
bed = await info(idOf.bed);
check('Rotation 90°: Modell gedreht (Breite ↔ Tiefe im Grundriss)', near(bed.size[0], 1.4, 0.03) && near(bed.size[2], 1.8, 0.02) && near(bed.rotY, -Math.PI / 2, 1e-6), `${bed.size[0].toFixed(2)} × ${bed.size[2].toFixed(2)}`);
const headZ = await page.evaluate((id) => {
  const s = window.__PLANNER_R3F__(); const g = s.scene.getObjectByName(id);
  const head = g.children[0].children[1]; // BedModel-Gruppe → Kopfteil (lokal −x)
  return [head.getWorldPosition(s.camera.position.clone()).z, g.position.z];
}, idOf.bed);
check('90° = im Uhrzeigersinn: Kopfteil zeigt nach oben (Norden)', headZ[0] < headZ[1] - 0.5);
await setField('Rotation', '-90');
check('−90° wird zu 270° normalisiert', (await val('Rotation')) === '270');
const rot = field('Rotation'); await rot.click(); await rot.press('ArrowUp'); await rot.press('ArrowUp'); await rot.press('Enter'); await settle(120);
check('Pfeiltaste: 270° + 2 × 15° = 300°', (await val('Rotation')) === '300');
await setField('Rotation', '370');
check('370° wird begrenzt/normalisiert (0°)', (await val('Rotation')) === '0');

// ---------- 5. Auswahl in 3D ----------
await page.mouse.click(1300, 860); await settle(200);
check('Klick ins Leere: keine Auswahl', (await selectedFurniture()) === null);
await page.evaluate(() => { (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(0.3, 7.5, 3.2); s.invalidate(); })(); });
await settle(900);
await shot('furniture-3d-top');
for (const type of ['bed', 'wardrobe', 'sofa', 'table']) {
  const p = await screenOf(idOf[type]);
  await page.mouse.click(p.x, p.y); await settle(250);
  const i = await info(idOf[type]);
  const expected = type === 'bed' ? 'Mein Bett' : defaults[type][0];
  check(`3D: Klick wählt ${expected}`, (await selectedFurniture()) === expected && i.selected3D);
}
const others3D = await Promise.all(['bed', 'wardrobe', 'sofa'].map((t) => info(idOf[t])));
check('3D: nur das ausgewählte Möbel hervorgehoben', others3D.every((i) => !i.selected3D));
await shot('furniture-3d-selected');

// Auswahl wechselt zwischen Möbel und Öffnung
await page.getByTestId('add-door').click(); await settle(200);
check('Tür hinzufügen: Möbel-Eigenschaften weg, Tür-Eigenschaften da', (await props.count()) === 0 && (await page.getByTestId('opening-properties').count()) === 1);
// Tür an eine freie Stelle (Nordwand), damit ihr Schwenkbereich kein Möbel trifft (seit Kollisionserkennung relevant)
{ const op = page.getByTestId('opening-properties'); await op.getByLabel('Wand').selectOption('north'); await settle(100);
  const i = op.getByLabel('Abstand von links', { exact: true }); await i.fill('2,3'); await i.press('Enter'); await settle(150); }
{ const p = await screenOf(idOf.table); await page.mouse.click(p.x, p.y); await settle(250); }
check('Klick auf Tisch: Tür-Eigenschaften weg, Tisch ausgewählt', (await page.getByTestId('opening-properties').count()) === 0 && (await selectedFurniture()) === 'Esstisch 1');

// ---------- 6. 2D: Symbole, Auswahl, Hervorhebung ----------
await toggle('2D');
const all2d = await Promise.all(Object.values(idOf).map(info));
check('2D: alle Möbel als Grundriss-Symbol, kein 3D-Modell', all2d.every((i) => i.hasPlan && !i.has3D));
const table2d = await info(idOf.table);
check('2D: Tisch 90° gedreht dargestellt (0,80 × 1,40)', near(table2d.size[0], 0.8, 0.01) && near(table2d.size[2], 1.4, 0.01), `${table2d.size[0].toFixed(2)} × ${table2d.size[2].toFixed(2)}`);
check('2D: ausgewählter Tisch dezent hervorgehoben', table2d.planFill === 'dfe8fc' && all2d.filter((i) => i.type !== 'table').every((i) => i.planFill === 'ffffff'));
for (const type of ['sofa', 'wardrobe', 'bed']) {
  const p = await screenOf(idOf[type]);
  await page.mouse.click(p.x, p.y); await settle(250);
  const expected = type === 'bed' ? 'Mein Bett' : defaults[type][0];
  check(`2D: Klick wählt ${expected}`, (await selectedFurniture()) === expected && (await info(idOf[type])).planFill === 'dfe8fc');
}
// Kein Drag & Drop: Ziehen auf Möbel pannt, verschiebt nicht
const before = await info(idOf.bed);
const lb = await page.getByTestId('dimension-label').first().boundingBox();
{ const p = await screenOf(idOf.bed); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 60, p.y + 30, { steps: 6 }); await page.mouse.up(); await settle(700); }
const la = await page.getByTestId('dimension-label').first().boundingBox();
const after = await info(idOf.bed);
check('2D: Ziehen verschiebt Möbel, Kamera pannt nicht (seit Möbel-Drag & Drop)', Math.abs(after.pos[0] - before.pos[0]) > 0.2 && Math.abs(la.x - lb.x) < 0.5, `Δx ${(after.pos[0] - before.pos[0]).toFixed(2)} m`);
await page.mouse.click(1300, 860); await settle(250);
check('2D: Klick ins Leere hebt Auswahl auf', (await selectedFurniture()) === null);
await shot('furniture-2d');

// ---------- 7. 2D/3D wechseln ----------
const snap = JSON.stringify(await Promise.all(Object.values(idOf).map(async (id) => { const i = await info(id); return [id, i.pos, i.rotY]; })));
for (let k = 0; k < 6; k++) await toggle(k % 2 === 0 ? '3D' : '2D');
const snapAfter = JSON.stringify(await Promise.all(Object.values(idOf).map(async (id) => { const i = await info(id); return [id, i.pos, i.rotY]; })));
check('6× 2D/3D: Möbel unverändert', snap === snapAfter);
check('Nach Wechsel (2D): Symbole aktiv', (await Promise.all(Object.values(idOf).map(info))).every((i) => i.hasPlan));
await toggle('3D');
check('3D: Modelle aktiv', (await Promise.all(Object.values(idOf).map(info))).every((i) => i.has3D && !i.hasPlan));

// ---------- 8. Raum verkleinern ----------
await setRoom(0, '2');
const shrunk = await Promise.all(Object.values(idOf).map(info));
check('Raum 2 m breit: alle Mittelpunkte im Raum', shrunk.every((i) => i.pos[0] >= -1.0001 && i.pos[0] <= 1.0001), shrunk.map((i) => i.pos[0].toFixed(2)).join(', '));
await setRoom(0, '5');

// ---------- 9. Löschen ----------
await listItems().nth(2).click(); await settle(100);
await page.getByTestId('delete-furniture').click(); await settle(250);
check('Löschen: Sofa aus Liste und Szene entfernt', (await listItems().count()) === 3 && !(await ids()).includes(idOf.sofa));
check('Nach Löschen keine Auswahl', (await selectedFurniture()) === null);

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
