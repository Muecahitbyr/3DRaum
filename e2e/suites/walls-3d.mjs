import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(800);
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const W = 5, L = 4, T = 0.15;
const SIDES = ['north', 'east', 'south', 'west'];

/** Zustand aller Wände: Sichtbarkeit, Deckkraft der Wandfläche, Klickbarkeit, Schatten. */
const walls = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const out = {};
  for (const side of ['north', 'east', 'south', 'west']) {
    const g = s.scene.getObjectByName('wall-' + side);
    const body = g.getObjectByName('wall-' + side + '-body');
    out[side] = {
      vis: g.userData.visibility,
      opacity: body.material.opacity,
      transparent: body.material.transparent,
      castShadow: body.castShadow,
      interactive: s.internal.interaction.includes(body),
    };
  }
  return out;
});
const fadedSet = (w) => SIDES.filter((s) => w[s].vis < 0.5).sort().join('+') || '–';
/** Wartet, bis sich die Überblendung eingeschwungen hat (Software-Rendering ist langsam). */
async function settleWalls(timeout = 4000) {
  const start = Date.now(); let prev = null;
  while (Date.now() - start < timeout) {
    // Eingeschwungen = alle Wände auf ihrem Endwert (0 oder 1) und über zwei Messungen unverändert.
    const w = await walls(); const key = SIDES.map((s) => w[s].vis.toFixed(4)).join();
    if (key === prev && SIDES.every((s) => w[s].vis === 0 || w[s].vis === 1)) return w;
    prev = key; await settle(120);
  }
  return walls();
}
const setCamera = async (x, y, z) => { await page.evaluate(([x, y, z]) => window.__PLANNER_R3F__().camera.position.set(x, y, z), [x, y, z]); return settleWalls(); };
/** Erwartung aus der Kameraposition: Wand ausgeblendet, wenn die Kamera deutlich außerhalb ihrer Ebene steht. */
// Mitte des Übergangsbands (−0,2 … 0,8 m) = Sichtbarkeit 0,5
const expected = ([x, , z]) => SIDES.filter((s) => ({ north: -z - L / 2, south: z - L / 2, east: x - W / 2, west: -x - W / 2 })[s] > 0.3).sort().join('+') || '–';
const camPos = () => page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());

const fp = page.getByTestId('furniture-properties');
const op = page.getByTestId('opening-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(80); };
const selectedFurniture = async () => ((await fp.count()) ? await fp.getByLabel('Name', { exact: true }).inputValue() : null);
const screenOf = (name, yFactor = 0.9) => page.evaluate(([name, yf]) => {
  const s = window.__PLANNER_R3F__(); let g = null;
  s.scene.traverse((o) => { if (o.userData?.furnitureId && o.parent?.name === 'furniture' && !g && o.name === name) g = o; });
  const bounds = g.getObjectByName('furniture-bounds');
  const v = g.localToWorld(s.camera.position.clone().set(0, bounds.geometry.parameters.height * yf, 0)).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [name, yFactor]);
const lastFurnitureId = () => page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && (id = o.userData.furnitureId)); return id; });

// ---------- 1. Startkamera ----------
let w = await walls();
const start = await camPos();
check('Start: Kamera schräg von oben (Süd-Ost), Süd- und Ostwand ausgeblendet', fadedSet(w) === 'east+south' && fadedSet(w) === expected(start), `${fadedSet(w)} @ ${start.map((v) => v.toFixed(1)).join(', ')}`);
check('Start: Nord- und Westwand vollständig sichtbar', w.north.opacity === 1 && w.west.opacity === 1 && !w.north.transparent);
check('Start: sofort im Zielzustand (keine Einblend-Animation)', w.south.vis === 0 && w.east.vis === 0);
const elevation = (Math.atan2(start[1], Math.hypot(start[0], start[2])) * 180) / Math.PI;
const fill = await page.evaluate(({ W, L, T }) => {
  const s = window.__PLANNER_R3F__(); const P = s.camera.position.clone();
  let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
  for (const y of [0, 2.5]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const v = P.clone().set(sx * (W / 2 + T), y, sz * (L / 2 + T)).project(s.camera);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, x1, y0, y1, w: (x1 - x0) / 2, h: (y1 - y0) / 2 };
}, { W, L, T });
check('Start: Blickwinkel sinnvoll (35°–50° Neigung)', elevation > 35 && elevation < 50, `${elevation.toFixed(1)}°`);
check('Start: Raum vollständig im Bild und groß dargestellt (≥ 75 % in einer Richtung)', fill.x0 >= -1 && fill.x1 <= 1 && fill.y0 >= -1 && fill.y1 <= 1 && Math.max(fill.w, fill.h) >= 0.75, `Breite ${(fill.w * 100).toFixed(0)} %, Höhe ${(fill.h * 100).toFixed(0)} %`);
// Möbel direkt an der (ausgeblendeten) Südwand in der Startansicht anklicken
await addFurniture(page, 'table'); await settle(150);
await setIn(fp, 'X-Position', '2,5'); await setIn(fp, 'Z-Position', '3,55');
const tableId = await lastFurnitureId();
await page.mouse.click(1390, 880); await settle(200);
{ const p = await screenOf(tableId, 0.95); await page.mouse.click(p.x, p.y); await settle(200); }
check('Start: Tisch an der ausgeblendeten Südwand direkt anklickbar', (await selectedFurniture()) === 'Esstisch 1');
await shot('w-start');

// ---------- 2. Alle vier Seiten ----------
for (const [side, pos] of [['south', [0, 3, 9]], ['north', [0, 3, -9]], ['east', [10, 3, 0]], ['west', [-10, 3, 0]]]) {
  w = await setCamera(...pos);
  const others = SIDES.filter((s) => s !== side);
  check(`Kamera ${side}: nur ${side}-Wand ausgeblendet`, fadedSet(w) === side, fadedSet(w));
  check(`Kamera ${side}: ausgeblendet = stark transparent (8 %), nicht klickbar, kein Schatten`, near(w[side].opacity, 0.08, 0.001) && w[side].transparent && !w[side].interactive && !w[side].castShadow);
  check(`Kamera ${side}: übrige Wände voll sichtbar und klickbar`, others.every((s) => w[s].opacity === 1 && w[s].interactive && w[s].castShadow));
}
await shot('w-west');

// ---------- 3. Ecken, von oben, von innen ----------
for (const pos of [[7, 4, 6], [-7, 4, 6], [7, 4, -6], [-7, 4, -6]]) {
  w = await setCamera(...pos);
  check(`Ecke ${pos[0] > 0 ? 'Ost' : 'West'}/${pos[2] > 0 ? 'Süd' : 'Nord'}: zwei angrenzende Wände ausgeblendet`, fadedSet(w) === expected(pos) && fadedSet(w).split('+').length === 2, fadedSet(w));
}
w = await setCamera(0.01, 11, 0.01);
check('Senkrecht von oben: keine Wand ausgeblendet', fadedSet(w) === '–', fadedSet(w));
w = await setCamera(0.3, 1.6, 0.9);
check('Kamera im Raum: keine Wand ausgeblendet', fadedSet(w) === '–', fadedSet(w));
w = await setCamera(9, 1.5, 0.5);
check('Flach von Osten: nur Ostwand (nicht pauschal zwei Wände)', fadedSet(w) === 'east', fadedSet(w));

// ---------- 4. Weicher Übergang ----------
await setCamera(0, 3, 9);
await page.evaluate(() => window.__PLANNER_R3F__().camera.position.set(0, 3, -9));
const samples = [];
for (let i = 0; i < 12; i++) { const x = await walls(); samples.push([x.south.vis, x.north.vis]); await settle(40); }
const southSeq = samples.map((s) => s[0]); const northSeq = samples.map((s) => s[1]);
const monotonic = (seq, dir) => seq.every((v, i) => i === 0 || (dir > 0 ? v >= seq[i - 1] - 1e-9 : v <= seq[i - 1] + 1e-9));
check('Übergang weich: Zwischenwerte statt Sprung', [...southSeq, ...northSeq].some((v) => v > 0.02 && v < 0.98), southSeq.map((v) => v.toFixed(2)).join(' '));
check('Übergang ohne Flackern: monoton (Süd ein-, Nord ausblenden)', monotonic(southSeq, 1) && monotonic(northSeq, -1));
w = await settleWalls();
check('Übergang endet im Zielzustand', fadedSet(w) === 'north');

// ---------- 5. Während OrbitControls drehen ----------
await setCamera(...start);
const trace = [];
{
  await page.mouse.move(900, 450); await page.mouse.down();
  for (let i = 1; i <= 24; i++) { await page.mouse.move(900 + i * 25, 450); const x = await walls(); trace.push(SIDES.map((s) => x[s].vis)); }
  await page.mouse.up();
}
w = await settleWalls();
const endPos = await camPos();
// Richtungswechsel zählen – Pausen (z. B. vollständig ausgeblendet, Änderung 0) überbrücken.
const flips = SIDES.map((_, k) => { let n = 0; let last = 0; for (let i = 1; i < trace.length; i++) { const d = trace[i][k] - trace[i - 1][k]; if (Math.abs(d) < 1e-6) continue; if (last * d < 0) n++; last = d; } return n; });
check('OrbitControls: Wandauswahl aktualisiert sich beim Drehen', fadedSet(w) === expected(endPos) && fadedSet(w) !== 'east+south', `${fadedSet(w)} @ ${endPos.map((v) => v.toFixed(1)).join(', ')}`);
// Flackern = wiederholtes Hin und Her. Ein einzelner Richtungswechsel ist legitim
// (Kamera schwenkt an einer Wand vorbei: aus- und danach wieder einblenden).
check('OrbitControls: kein Flackern (höchstens ein Richtungswechsel je Wand)', flips.every((n) => n <= 1), flips.join(','));
check('OrbitControls: Kamera schwenkt an der Westwand vorbei → sie blendet aus und wieder ein', trace.some((t) => t[3] < 0.05) && flips[3] === 1);
await shot('w-orbit');

// ---------- 6. Türen und Fenster in ausgeblendeten Wänden ----------
await page.getByTestId('add-door').click(); await settle(150); // Südwand
await setIn(op, 'Abstand von links', '0,5');
await page.getByTestId('add-window').click(); await settle(150);
await op.getByLabel('Wand').selectOption('south'); await settle(100); await setIn(op, 'Abstand von links', '3');
await page.mouse.click(1390, 880); await settle(150);
const openingState = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__(); const out = {};
  s.scene.traverse((o) => {
    if (!o.userData?.openingType || o.parent?.name !== 'wall-south') return;
    let frame = null, glass = null;
    o.traverse((m) => { if (m.isMesh && m.material?.colorWrite !== false) { if (m.name === 'window-glass') glass = m.material.opacity; else if (frame === null) frame = m.material.opacity; } });
    out[o.userData.openingType] = { frame, glass, interactive: s.internal.interaction.includes(o) };
  });
  return out;
});
await setCamera(0, 3, 9);
let o = await openingState();
check('Südwand ausgeblendet: Tür und Fenster ebenfalls ausgeblendet', near(o.door.frame, 0.15, 0.001) && near(o.window.frame, 0.15, 0.001) && near(o.window.glass, 0.25 * 0.15, 0.001), JSON.stringify(o));
check('… und nicht klickbar (blockieren nichts dahinter)', !o.door.interactive && !o.window.interactive);
await shot('w-openings-faded');
await setCamera(0, 3, -9);
o = await openingState();
check('Südwand sichtbar (Kamera Nord): Tür/Fenster normal und klickbar', o.door.frame === 1 && near(o.window.glass, 0.25, 1e-6) && o.door.interactive && o.window.interactive, JSON.stringify(o));
await shot('w-openings-visible');

// ---------- 7. Möbel hinter ausgeblendeten Wänden anklicken ----------
await setCamera(0.4, 1.3, 7); // flach von Süden: Sichtstrahl zum Tisch geht durch die Südwand
check('Flach von Süden: Südwand ausgeblendet', fadedSet(await walls()) === 'south');
await page.mouse.click(1390, 880); await settle(150);
{ const p = await screenOf(tableId, 0.5); await page.mouse.click(p.x, p.y); await settle(200); }
check('Möbel hinter ausgeblendeter Wand (inkl. Fenster davor) anklickbar', (await selectedFurniture()) === 'Esstisch 1');
// Gegenprobe: Eine sichtbare Wand fängt Klicks weiterhin ab
{
  const p = await page.evaluate(() => { const s = window.__PLANNER_R3F__(); const v = s.camera.position.clone().set(-1.8, 2.2, -2.0).project(s.camera); const r = s.gl.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; });
  await page.mouse.click(p.x, p.y); await settle(200);
}
check('Sichtbare Nordwand fängt Klick ab (Auswahl aufgehoben)', (await selectedFurniture()) === null);
await setCamera(-0.4, 1.3, -7); // gegenüber: Nordwand ausgeblendet, Tisch steht an der Südwand
{ const p = await screenOf(tableId, 0.95); await page.mouse.click(p.x, p.y); await settle(200); }
check('Von Norden durch ausgeblendete Nordwand: Tisch anklickbar', (await selectedFurniture()) === 'Esstisch 1');

// ---------- 8. Wechsel 2D ↔ 3D ----------
await setCamera(7, 4, 6);
await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(300);
w = await walls();
check('2D: alle Wände voll sichtbar, deckend, ohne Schatten, klickbar (unverändert)', SIDES.every((s) => w[s].vis === 1 && w[s].opacity === 1 && !w[s].transparent && !w[s].castShadow && w[s].interactive));
o = await openingState();
check('2D: Tür/Fenster-Symbole normal und greifbar', o.door.interactive && o.window.interactive);
await shot('w-2d');
await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(200);
w = await walls();
check('Zurück in 3D: sofort passende Wände ausgeblendet', fadedSet(w) === 'east+south' && w.south.vis === 0);
for (let k = 0; k < 4; k++) { await page.getByRole('button', { name: k % 2 ? '3D' : '2D', exact: true }).click(); await settle(200); }
w = await walls();
check('Mehrfach 2D ↔ 3D: Zustand stimmt', fadedSet(w) === 'east+south');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
