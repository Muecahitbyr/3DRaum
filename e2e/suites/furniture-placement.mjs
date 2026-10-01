import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { analyzeImage, exportFile } from '../lib/images.mjs';
import { addFurniture } from '../lib/planner.mjs';
import { diningArea, livingCollision, officeDesk, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * V1.1 Block B – Möbel realistisch platzieren: semantische Kollisionen in echten Anordnungen
 * (Essbereich, Büro, Wohnzimmer), 3D-Bearbeiten (auswählen, ziehen, drehen; Kamera ruht;
 * ein Verlaufsschritt; Esc), Hilfselemente nur in „Bearbeiten“, gemeinsames Drehen von
 * Auswahl und Gruppe, Gruppennamen, Platzsuche neuer Möbel, Tischlampe auf Trägern und
 * Touch auf Smartphone/Tablet.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;
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

const fp = page.getByTestId('furniture-properties');
const value = async (label, p = page) => num(await p.getByTestId('furniture-properties').getByLabel(label, { exact: true }).inputValue());
const setIn = async (label, text) => { const i = fp.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const undoTitle = async (p = page) => (await p.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const mode = async (label) => { await page.getByTestId('view-3d-mode').getByRole('button', { name: label }).click(); await settle(1000); };
const selectByName = async (name) => { await page.getByTestId('furniture-list-item').filter({ hasText: name }).first().click(); await settle(); };
/** Möbel in der Liste mit Kollisionsmarkierung (Name → Schweregrad). */
const severities = () => page.getByTestId('furniture-list-item').evaluateAll((els) => Object.fromEntries(els.filter((e) => e.querySelector('[data-severity]')).map((e) => [e.querySelector('span:nth-child(2)')?.textContent ?? e.textContent, e.querySelector('[data-severity]').getAttribute('data-severity')])));
/** Szenendaten eines Möbels (per ID): Welt-Lage, Höhe der Unterkante, Drehung. */
const info = (id, p = page) => p.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const o = s.scene.getObjectByName(id);
  return o ? { x: +o.position.x.toFixed(3), y: +o.position.y.toFixed(3), z: +o.position.z.toFixed(3), rot: +(-o.rotation.y * 180 / Math.PI).toFixed(1) } : null;
}, id);
/** Bildschirmpunkt eines Weltpunkts. */
const project3 = (x, y, z, p = page) => p.evaluate(({ x, y, z }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, y, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x, y, z });
/** Mitte des Möbelkörpers auf dem Bildschirm (3D) bzw. Bodenpunkt (2D). */
const screenOf = (id, p = page) => p.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const o = s.scene.getObjectByName(id);
  const body = o.getObjectByName('furniture-bounds');
  const v = (s.camera.isPerspectiveCamera && body ? body.getWorldPosition(s.camera.position.clone()) : o.getWorldPosition(s.camera.position.clone()).setY(0.05)).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, id);
const camera = (p = page) => p.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray().map((v) => +v.toFixed(4)));
/** Warten, bis die Kamera ruht (Dämpfung einer vorherigen Drehung abgeklungen). */
async function restCamera(p = page) {
  let last = await camera(p);
  for (let i = 0; i < 30; i++) {
    await p.waitForTimeout(150);
    const now = await camera(p);
    if (JSON.stringify(now) === JSON.stringify(last)) return now;
    last = now;
  }
  return last;
}
/** Aktueller Radius des Drehrings (wächst bei kleinem Maßstab, damit der Griff neben dem Möbel liegt). */
const ringRadius = (p = page) => p.evaluate(() => {
  let r = null;
  window.__PLANNER_R3F__().scene.traverse((o) => { if (o.name === 'furniture-rotation-ring') r = o.children[0].scale.x; });
  return r;
});
const helpers = (p = page) => p.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const found = { ring: 0, footprint: 0 };
  s.scene.traverse((o) => { if (o.name === 'furniture-rotation-ring') found.ring++; if (o.name === 'furniture-footprint') found.footprint++; });
  return { ...found, knob: document.querySelectorAll('[data-testid="rotation-handle-3d"], [data-testid="formation-rotation-handle"]').length };
});
async function mouseDrag(from, to, { steps = 10, during, escape = false } = {}) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await settle(120);
  const live = during ? await during() : undefined;
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up(); await settle();
  return live;
}

// ---------- 1. Essbereich: Stühle teilweise unter dem Tisch
await openScene(page, diningArea());
check('Essbereich: sechs Stühle teilweise unter dem Tisch – keine Kollisionswarnung', JSON.stringify(await severities()) === '{}', JSON.stringify(await severities()));
await selectByName('Stuhl 2');
check('Stuhl unter dem Tisch: keine Meldung in den Eigenschaften', (await fp.getByTestId('collision-notice').count()) === 0);
await view('2D');
const clearances = await page.locator('[data-testid^="clearance-"][data-conflict]').evaluateAll((els) => els.map((e) => e.getAttribute('data-conflict')));
check('Abstandsmaße: Tisch über dem Stuhl ist keine „Überschneidung“', clearances.length === 4 && clearances.every((c) => c === 'false'), JSON.stringify(clearances));
await page.screenshot({ path: `${OUT}/01-essbereich-2d.png` });
await setIn('Z-Position', '2,3'); // Lehne unter die Platte
check('Stuhl zu weit unter den Tisch (Lehne unter der Platte): Konflikt', (await fp.getByTestId('collision-notice').count()) === 1 && (await page.locator('[data-testid^="clearance-"][data-conflict="true"]').count()) >= 1);
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: wieder ohne Konflikt', (await fp.getByTestId('collision-notice').count()) === 0 && near(await value('Z-Position'), 1.94));
await view('3D');

// ---------- 2. 3D: auswählen, Hilfselemente
await page.getByTestId('furniture-list-item').filter({ hasText: 'Stuhl 2' }).click({ modifiers: [] });
await page.mouse.click(1400, 880); await settle(300); // Auswahl aufheben (leerer Bereich)
const chair5 = 'furniture-6'; // Stuhl 5 (Südseite, zur Kamera)
let s5 = await screenOf(chair5);
await page.mouse.click(s5.x, s5.y); await settle(400);
check('3D: Klick wählt den Stuhl aus', (await fp.count()) === 1 && (await fp.getByLabel('Name').inputValue()) === 'Stuhl 5');
let h = await helpers();
check('3D Bearbeiten: Grundfläche, Drehring und Griff am ausgewählten Möbel', h.ring === 1 && h.footprint === 1 && h.knob === 1, JSON.stringify(h));
await page.screenshot({ path: `${OUT}/02-3d-auswahl.png` });

// ---------- 3. 3D: ziehen (Kamera ruht, ein Schritt, Esc)
let cam0 = await restCamera();
let x0 = await value('X-Position');
let z0 = await value('Z-Position');
s5 = await screenOf(chair5);
const live = await mouseDrag(s5, { x: s5.x + 110, y: s5.y + 30 }, { during: async () => ({ x: await value('X-Position'), cam: await camera() }) });
const x1 = await value('X-Position');
check('3D-Drag: Möbel folgt dem Zeiger live (Sidebar)', Math.abs(live.x - x0) > 0.2, `${x0} → ${live.x}`);
check('3D-Drag: Kamera dreht sich währenddessen nicht', JSON.stringify(live.cam) === JSON.stringify(cam0) && JSON.stringify(await camera()) === JSON.stringify(cam0));
check('3D-Drag: ein Verlaufsschritt „Möbel verschieben“', (await undoTitle()) === 'Möbel verschieben rückgängig');
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: Stuhl exakt zurück', near(await value('X-Position'), x0) && near(await value('Z-Position'), z0));
await page.keyboard.press('ControlOrMeta+Shift+z'); await settle();
check('Redo: Stuhl wieder verschoben', near(await value('X-Position'), x1));
await page.keyboard.press('ControlOrMeta+z'); await settle();
const stepBefore = await undoTitle();
s5 = await screenOf(chair5);
await mouseDrag(s5, { x: s5.x - 120, y: s5.y }, { escape: true });
check('Esc während des Ziehens: Ausgangslage, kein neuer Schritt', near(await value('X-Position'), x0) && near(await value('Z-Position'), z0) && (await undoTitle()) === stepBefore);
// 3D-Raumgrenze: weit hinaus ziehen → bleibt im Raum
s5 = await screenOf(chair5);
await mouseDrag(s5, { x: s5.x + 700, y: s5.y + 300 });
const bounded = await value('X-Position');
check('3D-Drag: Raumgrenze bleibt eingehalten', bounded <= 6 - 0.22 + 0.01 && bounded > x0, String(bounded));
await page.keyboard.press('ControlOrMeta+z'); await settle();
// Ziehen über ein NICHT ausgewähltes Möbel: Kamera dreht, Möbel bleibt
const chair6 = 'furniture-7';
const before6 = await info(chair6);
cam0 = await restCamera();
const s6 = await screenOf(chair6);
await mouseDrag(s6, { x: s6.x + 120, y: s6.y });
check('3D: Ziehen über ein nicht ausgewähltes Möbel dreht die Kamera, Möbel bleibt stehen', JSON.stringify(await camera()) !== JSON.stringify(cam0) && JSON.stringify(await info(chair6)) === JSON.stringify(before6));
await page.screenshot({ path: `${OUT}/03-3d-drag.png` });

// ---------- 4. 3D: drehen am Ring
await selectByName('Stuhl 5');
const rot0 = await value('Rotation');
const center = await info(chair5);
cam0 = await restCamera();
const knob = await page.getByTestId('rotation-handle-3d').boundingBox();
const k = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
// Griff: lokal −z im Abstand r → Welt (r·sin φ, −r·cos φ); um 90° im Uhrzeigersinn gedreht → (r·cos φ, r·sin φ).
const r = await ringRadius();
const phi = (rot0 * Math.PI) / 180;
const knobStart = await project3(center.x + r * Math.sin(phi), 0.015, center.z - r * Math.cos(phi));
const target = await project3(center.x + r * Math.cos(phi), 0.015, center.z + r * Math.sin(phi));
check('Drehgriff sitzt auf dem Ring hinter dem Möbel', Math.hypot(knobStart.x - k.x, knobStart.y - k.y) < 6, JSON.stringify({ knobStart, k }));
const angleLive = await mouseDrag(k, target, { steps: 16, during: () => page.getByTestId('rotation-angle').textContent().catch(() => null) });
const rot1 = await value('Rotation');
check('3D-Drehen: 90° (Einrasten auf 0/90/180/270°), Winkelanzeige währenddessen', (rot1 - rot0 + 360) % 360 === 90 && !!angleLive, `${rot0} → ${rot1}, ${angleLive}`);
check('3D-Drehen: Kamera ruht, ein Schritt „Möbel drehen“', JSON.stringify(await camera()) === JSON.stringify(cam0) && (await undoTitle()) === 'Möbel drehen rückgängig', JSON.stringify({ cam0, cam: await camera(), title: await undoTitle() }));
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: Drehung zurück', (await value('Rotation')) === rot0);
const knob2 = await page.getByTestId('rotation-handle-3d').boundingBox();
const titleBeforeEsc = await undoTitle();
await mouseDrag({ x: knob2.x + knob2.width / 2, y: knob2.y + knob2.height / 2 }, target, { steps: 12, escape: true });
check('Esc beim Drehen: Ausgangswinkel, kein neuer Schritt', (await value('Rotation')) === rot0 && (await undoTitle()) === titleBeforeEsc);
await page.screenshot({ path: `${OUT}/04-3d-drehen.png` });

// ---------- 5. Vorschau und Export ohne Hilfselemente
await mode('Vorschau');
h = await helpers();
check('Vorschau: kein Drehring, keine Grundfläche, kein Griff', h.ring === 0 && h.footprint === 0 && h.knob === 0, JSON.stringify(h));
await mode('Bearbeiten');
await page.getByTestId('export-button').click(); await page.getByTestId('export-dialog').waitFor(); await settle();
const png = await exportFile(page, 'export-3d-png');
const img = await analyzeImage(page, png.path, { colors: { selection: [37, 99, 235, 18] } });
check('3D-PNG mit ausgewähltem Möbel: keine Hilfselemente (Ring, Grundfläche, Umrandung)', img.counts.selection < 50, JSON.stringify(img.counts));
fs.copyFileSync(png.path, `${OUT}/05-export-3d.png`);
await page.keyboard.press('Escape'); await settle();
check('Nach dem Export: Hilfselemente in „Bearbeiten“ wieder da', (await helpers()).ring === 1);

// ---------- 6. Essgruppe: gruppieren, benennen, gemeinsam drehen (2D-Griff, Schaltflächen, 3D-Ring)
await view('2D');
await selectByName('Esstisch');
await page.keyboard.down('Shift');
for (const name of ['Stuhl 1', 'Stuhl 2', 'Stuhl 3', 'Stuhl 4', 'Stuhl 5', 'Stuhl 6']) await page.getByTestId('furniture-list-item').filter({ hasText: name }).click();
await page.keyboard.up('Shift'); await settle();
await page.getByTestId('group-furniture').click(); await settle();
const multi = page.getByTestId('multi-selection');
const nameField = multi.getByLabel('Gruppenname', { exact: true });
await nameField.click(); await nameField.fill('Essgruppe'); await nameField.press('Enter'); await settle();
check('Gruppe benannt: „Essgruppe“ (Titel), ein Schritt „Gruppe umbenennen“', (await multi.locator('h2, h3, [class*="title"]').first().textContent()).includes('Essgruppe') && (await undoTitle()) === 'Gruppe umbenennen rückgängig');
const gHandle = await page.getByTestId('formation-rotation-handle').boundingBox();
const tableId = 'furniture-1';
const tScreen = await screenOf(tableId);
const g = { x: gHandle.x + gHandle.width / 2, y: gHandle.y + gHandle.height / 2 };
// 2D: Bildschirm = Grundriss (Norden oben) → 90° im Uhrzeigersinn um die Auswahlmitte.
const gTarget = { x: tScreen.x - (g.y - tScreen.y), y: tScreen.y + (g.x - tScreen.x) };
await mouseDrag(g, gTarget, { steps: 16 });
const tableAfter = await info(tableId);
check('Gruppe per Griff um 90° gedreht: Tisch 90°', near(((tableAfter.rot % 360) + 360) % 360, 90, 0.6), JSON.stringify(tableAfter));
check('Gruppendrehung: Stühle bleiben unter dem Tisch, keine Kollision, ein Schritt', JSON.stringify(await severities()) === '{}' && (await undoTitle()) === 'Möbel drehen rückgängig', JSON.stringify(await severities()));
await page.screenshot({ path: `${OUT}/06-essgruppe-gedreht.png` });
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: Gruppe in Ausgangslage', near((await info(tableId)).rot, 0, 0.6));
await page.getByTestId('rotate-selection-cw').click(); await settle();
check('Schaltfläche „↻ 90°“: Gruppe gedreht, keine Kollision', near(((((await info(tableId)).rot) % 360) + 360) % 360, 90, 0.6) && JSON.stringify(await severities()) === '{}');
await view('3D');
check('3D: gemeinsamer Drehring für die Gruppe', (await page.getByTestId('formation-rotation-handle').count()) === 1 && (await helpers()).footprint === 7);
await page.getByTestId('project-save').click(); await settle(400);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:essbereich')));
check('Gespeichert: Gruppenname, Format 7', stored.version === 7 && stored.plan.groups[0].name === 'Essgruppe' && stored.plan.groups[0].memberIds.length === 7);

// ---------- 7. Platzsuche neuer Möbel
await openScene(page, { ...project('leer', 'Leer', { walls: rectangleWalls(5, 4, 2.5) }), version: 6 });
for (let i = 0; i < 3; i++) { await addFurniture(page, 'armchair'); await settle(); }
const placed = await page.evaluate(() => { const out = []; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureId && o.name === o.userData.furnitureId) out.push([+o.position.x.toFixed(2), +o.position.z.toFixed(2)]); }); return out; });
check('Drei Sessel nacheinander: verschiedene freie Plätze nahe der Mitte, keine Kollision', new Set(placed.map((p) => p.join())).size === 3 && JSON.stringify(await severities()) === '{}' && placed.every(([x, z]) => Math.hypot(x, z) < 1.6), JSON.stringify(placed));

// ---------- 8. Büro: Bürostuhl unter dem Schreibtisch, Tischlampe auf der Platte
await openScene(page, officeDesk());
check('Büro: Bürostuhl unter dem Schreibtisch – keine Warnung', JSON.stringify(await severities()) === '{}', JSON.stringify(await severities()));
check('Tischlampe steht auf dem Schreibtisch (0,75 m), Leselampe auf der Ablage (0,55 m)', near((await info('furniture-3')).y, 0.75) && near((await info('furniture-6')).y, 0.55));
await selectByName('Schreibtischlampe');
check('Eigenschaften: „Steht auf „Schreibtisch“ … Standhöhe automatisch“', (await fp.getByTestId('lamp-support').textContent()).includes('Schreibtisch'));
await setIn('Z-Position', '2');
check('Weggezogen: wieder eigene Standhöhe (0), Standhöhe-Feld zurück', near((await info('furniture-3')).y, 0) && (await fp.getByLabel('Standhöhe', { exact: true }).count()) === 1);
await setIn('Z-Position', '0,3');
check('Zurück auf den Schreibtisch: wieder 0,75 m', near((await info('furniture-3')).y, 0.75));
await mode('Vorschau');
await page.screenshot({ path: `${OUT}/07-buero-vorschau.png` });
await mode('Bearbeiten');

// ---------- 9. Wohnzimmer: echte Kollision bleibt sichtbar
await openScene(page, livingCollision());
const sev = await severities();
check('Wohnzimmer: Sessel im Couchtisch weiterhin als Kollision markiert', sev.Sessel === 'error' && sev.Couchtisch === 'error' && !sev.Sofa, JSON.stringify(sev));
await page.screenshot({ path: `${OUT}/08-wohnzimmer-3d.png` });

// ---------- 10. Touch: Smartphone und Tablet
for (const [w, hgt] of [[375, 812], [390, 844], [430, 932], [768, 1024]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true });
  const mp = await ctx.newPage();
  mp.on('pageerror', (e) => errors.push(String(e)));
  await mp.goto(process.env.E2E_DEV_URL);
  await mp.waitForFunction(() => !!window.__PLANNER_R3F__); await mp.waitForTimeout(800);
  await openScene(mp, diningArea());
  const cdp = await ctx.newCDPSession(mp);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const gesture = async (from, to, steps = 12) => {
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await touch('touchMove', from.map(([x, y], j) => [x + (to[j][0] - x) * t, y + (to[j][1] - y) * t]));
      await mp.waitForTimeout(16);
    }
    await touch('touchEnd', []); await mp.waitForTimeout(400);
  };
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await mp.waitForTimeout(60); await touch('touchEnd', []); await mp.waitForTimeout(400); };
  let p5 = await screenOf(chair5, mp);
  await tap(p5.x, p5.y);
  const chip = await mp.getByTestId('selection-chip').textContent().catch(() => '');
  const start = await info(chair5, mp);
  check(`Touch ${w}px 3D: Antippen wählt aus, verschiebt nicht`, chip.includes('Stuhl 5') && JSON.stringify(await info(chair5, mp)) === JSON.stringify(start), chip);
  // Zweites Antippen mit minimalem Wackeln (3 px) bleibt ein Antippen.
  await touch('touchStart', [[p5.x, p5.y]]); await touch('touchMove', [[p5.x + 3, p5.y + 2]]); await mp.waitForTimeout(40); await touch('touchEnd', []); await mp.waitForTimeout(400);
  check(`Touch ${w}px: Wackeln beim Antippen verschiebt nicht`, JSON.stringify(await info(chair5, mp)) === JSON.stringify(start));
  const camBefore = await camera(mp);
  p5 = await screenOf(chair5, mp);
  await gesture([[p5.x, p5.y]], [[p5.x + Math.min(70, w * 0.15), p5.y + 25]]);
  const moved = await info(chair5, mp);
  check(`Touch ${w}px 3D: ausgewählten Stuhl mit dem Finger ziehen, Kamera ruht`, Math.hypot(moved.x - start.x, moved.z - start.z) > 0.15 && JSON.stringify(await camera(mp)) === JSON.stringify(camBefore), JSON.stringify({ start, moved }));
  check(`Touch ${w}px: ein Schritt „Möbel verschieben“`, (await undoTitle(mp)) === 'Möbel verschieben rückgängig');
  // Zweiter Finger während des Ziehens: Abbruch, Geste gehört der Kamera.
  p5 = await screenOf(chair5, mp);
  await touch('touchStart', [[p5.x, p5.y]]);
  await touch('touchMove', [[p5.x + 30, p5.y]]); await mp.waitForTimeout(40);
  await touch('touchStart', [[p5.x + 30, p5.y], [p5.x + 30, p5.y + 120]]); await mp.waitForTimeout(40);
  await touch('touchEnd', []); await mp.waitForTimeout(400);
  check(`Touch ${w}px: zweiter Finger bricht das Ziehen ab (Stuhl zurück)`, near((await info(chair5, mp)).x, moved.x, 0.002) && near((await info(chair5, mp)).z, moved.z, 0.002));
  const knob = await mp.getByTestId('rotation-handle-3d').boundingBox();
  const hit = await mp.getByTestId('rotation-handle-3d').evaluate((e) => { const a = getComputedStyle(e, '::after'); return { content: a.content, inset: a.top }; });
  check(`Touch ${w}px: Drehgriff groß genug (≥ 26 px sichtbar, Greifbereich ≥ 44 px)`, knob.width >= 26 && hit.content !== 'none' && knob.width - 2 * parseFloat(hit.inset) >= 44, JSON.stringify({ w: knob.width, hit }));
  const chairScreen = await screenOf(chair5, mp);
  check(`Touch ${w}px: Drehgriff liegt neben dem Möbel (≥ 30 px Abstand zur Mitte)`, Math.hypot(knob.x + knob.width / 2 - chairScreen.x, knob.y + knob.height / 2 - chairScreen.y) >= 30);
  const rotBefore = (await info(chair5, mp)).rot;
  const phiT = (rotBefore * Math.PI) / 180;
  const rr = await ringRadius(mp);
  const turnTo = await project3(moved.x + rr * Math.cos(phiT), 0.015, moved.z + rr * Math.sin(phiT), mp);
  await gesture([[knob.x + knob.width / 2, knob.y + knob.height / 2]], [[turnTo.x, turnTo.y]], 16);
  check(`Touch ${w}px: Drehgriff dreht das Möbel`, (await info(chair5, mp)).rot !== rotBefore, `${rotBefore} → ${(await info(chair5, mp)).rot}`);
  // Ein Finger auf freier Fläche: Kamera dreht weiterhin; Pinch zoomt weiterhin.
  const cam1 = await camera(mp);
  await gesture([[w * 0.5, hgt * 0.85]], [[w * 0.5 + 80, hgt * 0.85]]);
  check(`Touch ${w}px 3D: Finger auf freier Fläche dreht die Kamera`, JSON.stringify(await camera(mp)) !== JSON.stringify(cam1));
  await mp.screenshot({ path: `${OUT}/09-touch-${w}.png` });
  await ctx.close();
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
