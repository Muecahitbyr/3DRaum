import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';
import { item, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * Lampen (Decken-, Pendel-, Steh-, Tischlampe) als Planungsobjekte mit echtem Licht,
 * Lampeneinstellungen, Raumhöhe, Duplizieren/Copy-Paste, Undo/Redo, Speichern/Laden,
 * 2D-Symbole, Lichtvorrat (max. 8 Quellen) sowie Möbelfarben.
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
const fp = page.getByTestId('furniture-properties');
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const selectByName = async (name) => { await page.getByTestId('furniture-list-item').filter({ has: page.locator(`span[title="${name}"]`) }).click(); await settle(); };
const setRange = async (testId, values) => {
  const el = fp.getByTestId(testId);
  await el.focus();
  for (const v of values) {
    await el.evaluate((node, value) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
    await settle(60);
  }
  await el.blur(); await settle();
};

/** Szene: Möbel/Lampen (Höhe, Glühen) und Lichtquellen. */
const scene = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__().scene;
  const items = {};
  s.traverse((o) => {
    if (!o.userData?.furnitureId) return;
    const glow = o.getObjectByName('lamp-glow');
    const firstColor = (() => { let c = null; o.traverse((m) => { if (!c && m.isMesh && m.material?.color && !['furniture-bounds', 'contact-shadow', 'lamp-glow'].includes(m.name)) c = m.material.color.getHexString(); }); return c; })();
    const plan = o.getObjectByName('furniture-plan-symbol');
    items[o.userData.furnitureId] = {
      type: o.userData.furnitureType,
      y: +o.position.y.toFixed(4),
      emissive: glow ? +glow.material.emissiveIntensity.toFixed(3) : null,
      emissiveColor: glow ? glow.material.emissive.getHexString() : null,
      color: firstColor,
      shadow: (() => { let found = false; s.traverse((c) => { if (c.userData?.shadowOf === o.userData.furnitureId) found = true; }); return found; })(),
      planFill: plan ? plan.children.find((m) => m.isMesh).material.color.getHexString() : null,
    };
  });
  const lights = [];
  s.traverse((o) => { if (o.name === 'lamp-light') lights.push({ id: o.userData.lampId, intensity: +o.intensity.toFixed(4), color: o.color.getHexString(), y: +o.position.y.toFixed(4), castShadow: o.castShadow }); });
  return { items, lights };
});
const lastId = async () => Object.keys((await scene()).items).sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1])).at(-1);
const lightOf = async (id) => (await scene()).lights.find((l) => l.id === id);

// ---------- 1. Bibliothek: Kategorie Lampen ----------
await page.getByTestId('furniture-library-button').click(); await settle();
const lib = page.getByTestId('furniture-library');
await lib.getByTestId('library-category-lamps').click(); await settle();
const cards = await lib.locator('[data-testid^="library-item-"]').evaluateAll((els) => els.map((e) => e.dataset.testid.replace('library-item-', '')));
check('Kategorie „Lampen“: Decken-, Pendel-, Steh- und Tischlampe', JSON.stringify(cards.sort()) === JSON.stringify(['ceiling-light', 'floor-lamp', 'pendant-light', 'table-lamp']), JSON.stringify(cards));
await page.keyboard.press('Escape'); await settle();

// ---------- 2. Deckenleuchte ----------
await addFurniture(page, 'ceiling-light'); await settle();
const ceilingId = await lastId();
let s = await scene();
check('Deckenleuchte hängt an der Decke (Oberkante = 2,50 m)', near(s.items[ceilingId].y + 0.12, 2.5), JSON.stringify(s.items[ceilingId]));
check('Verlauf: „Lampe hinzufügen“', (await undoTitle()) === 'Lampe hinzufügen rückgängig');
check('Deckenleuchte leuchtet (Punktlicht ohne Schatten, Schirm selbstleuchtend)', (await lightOf(ceilingId))?.intensity > 0 && !(await lightOf(ceilingId)).castShadow && s.items[ceilingId].emissive > 0, JSON.stringify(await lightOf(ceilingId)));
check('Deckenleuchte ohne Kontaktschatten am Boden', !s.items[ceilingId].shadow);
check('Eigenschaften: Lampeneinstellungen und Abhängungshinweis', (await fp.getByTestId('lamp-settings').count()) === 1 && (await fp.textContent()).includes('Hängt an der Decke'));
const on = (await lightOf(ceilingId)).intensity;
await fp.getByTestId('lamp-toggle').click(); await settle(300);
s = await scene();
check('Aus: kein Licht, Schirm dunkel', (await lightOf(ceilingId)) === undefined || (await lightOf(ceilingId)).intensity === 0);
check('Aus: Verlauf „Lampe einstellen“', (await undoTitle()) === 'Lampe einstellen rückgängig' && s.items[ceilingId].emissive === 0);
await key('ControlOrMeta+z');
check('Undo: wieder an', (await lightOf(ceilingId)).intensity === on);
await setRange('lamp-intensity', [1.2, 1.5, 1.8]);
check('Helligkeit 180 %: Lichtstärke skaliert, ein Verlaufsschritt', near((await lightOf(ceilingId)).intensity, on * 1.8) && (await undoTitle()) === 'Lampe einstellen rückgängig');
await key('ControlOrMeta+z');
check('Undo: Helligkeit zurück (ein Schritt für alle Zwischenwerte)', near((await lightOf(ceilingId)).intensity, on));
const warmColor = (await lightOf(ceilingId)).color;
await setRange('lamp-temperature', [4000, 5500, 6500]);
const coldColor = (await lightOf(ceilingId)).color;
check('Lichtfarbe 6500 K: kühler als 3000 K (mehr Blau)', parseInt(coldColor.slice(4), 16) > parseInt(warmColor.slice(4), 16), `${warmColor} → ${coldColor}`);
check('Schirm leuchtet in der Lichtfarbe', (await scene()).items[ceilingId].emissiveColor === coldColor);

// Raumhöhe ändern → Deckenleuchte wandert mit
const room = page.getByRole('region', { name: 'Raummaße' });
await setIn(room, 'Höhe', '3');
s = await scene();
check('Raumhöhe 3,00 m: Deckenleuchte hängt weiter an der Decke', near(s.items[ceilingId].y + 0.12, 3), JSON.stringify(s.items[ceilingId]));
check('Lichtquelle wandert mit', (await lightOf(ceilingId)).y > 2.8);
await key('ControlOrMeta+z');
check('Undo: wieder 2,50 m', near((await scene()).items[ceilingId].y + 0.12, 2.5));

// ---------- 3. Pendel-, Steh- und Tischlampe ----------
await addFurniture(page, 'pendant-light'); await settle();
const pendantId = await lastId();
check('Pendelleuchte: hängt 0,90 m von der Decke', near((await scene()).items[pendantId].y, 2.5 - 0.9));
await setIn(fp, 'Höhe', '2,4');
check('Abhängung begrenzt (mind. 30 cm über dem Boden)', (await fp.getByLabel('Höhe', { exact: true }).inputValue()) === '1,80');
await setIn(fp, 'Höhe', '0,9');
await addFurniture(page, 'table');
await setIn(fp, 'X-Position', '1'); await setIn(fp, 'Z-Position', '1');
await selectByName('Pendelleuchte 1');
await setIn(fp, 'X-Position', '1'); await setIn(fp, 'Z-Position', '1');
check('Pendelleuchte über dem Tisch: keine Kollision (unterschiedliche Höhen)', (await fp.getByTestId('collision-notice').count()) === 0);
await addFurniture(page, 'floor-lamp'); await settle();
const floorId = await lastId();
s = await scene();
check('Stehlampe steht am Boden, mit Kontaktschatten', s.items[floorId].y === 0 && s.items[floorId].shadow);
await setIn(fp, 'X-Position', '4,4'); await setIn(fp, 'Z-Position', '3,4');
await addFurniture(page, 'nightstand');
await setIn(fp, 'X-Position', '4,4'); await setIn(fp, 'Z-Position', '0,3');
await addFurniture(page, 'table-lamp'); await settle();
const tableLampId = await lastId();
check('Tischlampe: Standhöhe 0,75 m (Tischplatte)', near((await scene()).items[tableLampId].y, 0.75) && (await fp.getByLabel('Standhöhe', { exact: true }).inputValue()) === '0,75');
await setIn(fp, 'Standhöhe', '0,55');
await setIn(fp, 'X-Position', '4,4'); await setIn(fp, 'Z-Position', '0,3');
check('Tischlampe auf dem Nachttisch (0,55 m): steht darauf, keine Kollision', near((await scene()).items[tableLampId].y, 0.55) && (await fp.getByTestId('collision-notice').count()) === 0);
check('Verlauf: „Möbel verschieben“ bzw. „Standhöhe ändern“ vorhanden', ['Möbel verschieben rückgängig', 'Standhöhe ändern rückgängig'].includes(await undoTitle()));
s = await scene();
check('Vier Lampen, alle leuchten', ['ceiling-light', 'pendant-light', 'floor-lamp', 'table-lamp'].every((t) => Object.entries(s.items).some(([id, i]) => i.type === t && s.lights.some((l) => l.id === id && l.intensity > 0))));
await shot('01-lamps-3d');

// ---------- 4. 2D: nur Plansymbol, keine Lichtberechnung ----------
await view('2D');
s = await scene();
check('2D: Lampen als Plansymbole', ['ceiling-light', 'pendant-light', 'floor-lamp', 'table-lamp'].every((t) => Object.values(s.items).some((i) => i.type === t && i.planFill)));
check('2D: keine Lampenlichter aktiv', s.lights.every((l) => l.intensity === 0));
check('2D: Deckenleuchte über den Möbelsymbolen (höher gezeichnet)', s.items[ceilingId].y > 1);
await shot('02-lamps-2d');
// Deckenleuchte im Grundriss ziehen
{
  const { origin } = await page.evaluate(() => window.__PLANNER_R3F__().scene.getObjectByName('room').userData);
  const toScreen = (x, z, y) => page.evaluate(({ x, z, y }) => { const st = window.__PLANNER_R3F__(); const v = st.camera.position.clone().set(x, y, z).project(st.camera); const r = st.gl.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; }, { x: x - origin.x, z: z - origin.z, y });
  await selectByName('Deckenleuchte 1');
  const from = { x: Number((await fp.getByLabel('X-Position', { exact: true }).inputValue()).replace(',', '.')), z: Number((await fp.getByLabel('Z-Position', { exact: true }).inputValue()).replace(',', '.')) };
  const a = await toScreen(from.x, from.z, 2.4); const b = await toScreen(from.x - 1, from.z - 1, 2.4);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await settle(100); await page.mouse.up(); await settle(300);
  const to = Number((await fp.getByLabel('X-Position', { exact: true }).inputValue()).replace(',', '.'));
  check('2D: Deckenleuchte verschieben (Ziehen)', near(to, from.x - 1, 0.05), `${from.x} → ${to}`);
}
await view('3D');

// ---------- 5. Duplizieren / Copy-Paste / Löschen ----------
await selectByName('Deckenleuchte 1');
await setRange('lamp-temperature', [4000]);
await key('ControlOrMeta+d');
let copyId = await lastId();
s = await scene();
check('Duplizieren: Kopie mit Lichteinstellungen (4000 K) und Licht', (await fp.getByLabel('Name', { exact: true }).inputValue()) === 'Deckenleuchte 2' && s.lights.some((l) => l.id === copyId && l.color === (s.lights.find((x) => x.id === ceilingId)?.color)));
await key('ControlOrMeta+c'); await key('ControlOrMeta+v');
copyId = await lastId();
check('Copy/Paste: dritte Deckenleuchte leuchtet', (await scene()).lights.some((l) => l.id === copyId && l.intensity > 0));
await key('Delete');
check('Löschen: Verlauf „Lampe löschen“', (await undoTitle()) === 'Lampe löschen rückgängig');
await key('ControlOrMeta+z');

// ---------- 6. Lichtvorrat: höchstens 8 Quellen ----------
for (let i = 0; i < 6; i++) { await addFurniture(page, 'floor-lamp'); await settle(100); }
s = await scene();
const lampCount = Object.values(s.items).filter((i) => ['ceiling-light', 'pendant-light', 'floor-lamp', 'table-lamp'].includes(i.type)).length;
check(`${lampCount} Lampen → genau 8 Lichtquellen, keine mit Schatten`, lampCount >= 10 && s.lights.length === 8 && s.lights.every((l) => !l.castShadow), `${s.lights.length}`);
check('Die hellsten Lampen erhalten die Lichtquellen (Deckenleuchten zuerst)', s.lights.filter((l) => l.intensity > 0).length === 8 && s.lights.some((l) => l.id === ceilingId));

// ---------- 7. Möbelfarben ----------
await addFurniture(page, 'sofa'); await settle();
const sofaId = await lastId();
check('Sofa: Farbbereich „Stoff“ mit bisheriger Standardfarbe', (await fp.getByTestId('furniture-color-fabric').inputValue()) === '#7d8ea3' && (await scene()).items[sofaId].color === '7d8ea3');
{
  const input = fp.getByTestId('furniture-color-fabric');
  await input.focus();
  for (const c of ['#aa7766', '#9b4a3c']) {
    await input.evaluate((el, value) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, c);
    await settle(60);
  }
  await input.blur(); await settle();
}
s = await scene();
check('Stofffarbe in 3D sichtbar', s.items[sofaId].color === '9b4a3c');
check('Verlauf: ein Schritt „Möbelfarbe ändern“', (await undoTitle()) === 'Möbelfarbe ändern rückgängig');
await key('ControlOrMeta+d');
const sofaCopy = await lastId();
check('Duplikat behält die Farbe', (await scene()).items[sofaCopy].color === '9b4a3c');
await key('ControlOrMeta+z');
await selectByName('Sofa 1');
await view('2D');
check('2D: Symbol dezent eingefärbt, aber hell (lesbar)', await (async () => { await page.getByRole('button', { name: 'Auswahl aufheben' }).first().click().catch(() => {}); await settle(); const f = (await scene()).items[sofaId].planFill; const v = parseInt(f, 16); return f !== 'ffffff' && ((v >> 16) & 255) > 200 && ((v >> 8) & 255) > 180; })());
await view('3D');
await selectByName('Sofa 1');
await addFurniture(page, 'wardrobe');
const wardrobeId = await lastId();
check('Schrank: Farbbereich „Korpus“', (await fp.getByTestId('furniture-colors').textContent()).includes('Korpus'));
await fp.getByTestId('furniture-color-main').fill('#445566'); await settle();
check('Korpusfarbe in 3D', (await scene()).items[wardrobeId].color === '445566');
await fp.getByTestId('furniture-color-reset-main').click(); await settle();
check('„Standard“ setzt die Farbe zurück', (await scene()).items[wardrobeId].color === 'e8e3da');

// ---------- 8. Speichern / Laden ----------
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Lampen');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
const storedLamp = stored.plan.furniture.find((f) => f.id === ceilingId);
const storedSofa = stored.plan.furniture.find((f) => f.id === sofaId);
const storedTableLamp = stored.plan.furniture.find((f) => f.id === tableLampId);
check('Gespeichert: Licht, Farben, Standhöhe', storedLamp.light.temperature === 4000 && storedLamp.light.on === true && storedSofa.colors.fabric === '#9b4a3c' && storedTableLamp.elevation === 0.55, JSON.stringify({ storedLamp, storedSofa: storedSofa.colors }));
const before = await scene();
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Lampen' }).getByTestId('project-open').click(); await settle(700);
const after = await scene();
check('Geladen: Lampen, Licht und Farben identisch', JSON.stringify(after.items) === JSON.stringify(before.items) && JSON.stringify(after.lights) === JSON.stringify(before.lights));

// ---------- 9. Schlafzimmerszene: Lampen in allen Raumformen/Höhen ----------
await openScene(page, project('lampen-l', 'Lampen L-Form', {
  shape: 'l-shape',
  walls: [
    { id: 'wall-1', start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, height: 2.8, thickness: 0.15 },
    { id: 'wall-2', start: { x: 6, z: 0 }, end: { x: 6, z: 3 }, height: 2.8, thickness: 0.15 },
    { id: 'wall-3', start: { x: 6, z: 3 }, end: { x: 3.5, z: 3 }, height: 2.8, thickness: 0.15 },
    { id: 'wall-4', start: { x: 3.5, z: 3 }, end: { x: 3.5, z: 5 }, height: 2.8, thickness: 0.15 },
    { id: 'wall-5', start: { x: 3.5, z: 5 }, end: { x: 0, z: 5 }, height: 2.8, thickness: 0.15 },
    { id: 'wall-6', start: { x: 0, z: 5 }, end: { x: 0, z: 0 }, height: 2.8, thickness: 0.15 },
  ],
  height: 2.8,
  furniture: [item('pendant-light', 'Pendel', 5, 4.5, 0, [0.4, 0.4, 0.8], { light: { on: true, intensity: 1, temperature: 2700 } })],
}));
s = await scene();
const pendant = Object.values(s.items)[0];
check('L-Form: Pendelleuchte in der Aussparung wird in die Raumkontur geschoben, hängt an 2,80 m', pendant && near(pendant.y, 2.8 - 0.8), JSON.stringify(pendant));

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
