import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.0105) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 250) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const W = 5, L = 4;

const props = page.getByTestId('furniture-properties');
const field = (label) => props.getByLabel(label, { exact: true });
const pos = async () => ({ x: num(await field('X-Position').inputValue()), z: num(await field('Z-Position').inputValue()) });
const rotation = async () => num(await field('Rotation').inputValue());
const setField = async (label, text) => { const i = field(label); await i.click(); await i.fill(text); await i.press('Enter'); await settle(100); };
const place = async (x, z, r) => { await setField('Rotation', r); await setField('X-Position', x); await setField('Z-Position', z); };
const selectItem = async (i) => { await page.getByTestId('furniture-list-item').nth(i).click(); await settle(150); };
const selectedName = async () => ((await props.count()) ? await field('Name').inputValue() : null);
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const labels = () => page.getByTestId('dimension-label').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y]; }));
const samePos = (a, b, tol = 0.5) => a.every((p, i) => Math.abs(p[0] - b[i][0]) < tol && Math.abs(p[1] - b[i][1]) < tol);

const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, 0.02, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });
const guides = () => page.evaluate(() => {
  const out = []; window.__PLANNER_R3F__().scene.traverse((o) => o.name?.startsWith('furniture-snap-guide') && out.push(`${o.name.slice(-1)}:${o.userData.snapKind}`));
  return out.sort();
});
/** Welt-AABB der Grundfläche (Grundriss-Füllung) des Möbels in Grundrisskoordinaten. */
const footprint = (id) => page.evaluate(({ id, W, L }) => {
  const s = window.__PLANNER_R3F__(); const g = s.scene.getObjectByName(id);
  g.updateWorldMatrix(true, true);
  const fill = g.getObjectByName('furniture-plan-symbol').children.find((c) => c.isMesh);
  fill.geometry.computeBoundingBox();
  const b = fill.geometry.boundingBox.clone().applyMatrix4(fill.matrixWorld);
  return { x0: b.min.x + W / 2, x1: b.max.x + W / 2, z0: b.min.z + L / 2, z1: b.max.z + L / 2 };
}, { id, W, L });
const lastId = () => page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && (id = o.userData.furnitureId)); return id; });

/** Zieht vom Grundrisspunkt `from` nach `to`; `during` läuft vor dem Loslassen, `escape` bricht ab. */
async function drag(from, to, { during, escape } = {}) {
  const a = await toScreen(from.x, from.z);
  const b = await toScreen(to.x, to.z);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await settle(120);
  const res = during ? await during() : undefined;
  if (escape) { await page.keyboard.press('Escape'); await settle(100); }
  await page.mouse.up(); await settle(150);
  return res;
}
const dragSelected = async (to, opts) => drag(await pos(), to, opts);

/** Dreht über den Handle auf `targetDeg` (Grundriss, im Uhrzeigersinn), entlang eines Bogens. */
async function rotateTo(targetDeg, { during, escape, via } = {}) {
  const h = await page.getByTestId('rotation-handle').boundingBox();
  const hc = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  const p = await pos(); const c = await toScreen(p.x, p.z);
  const radius = Math.hypot(hc.x - c.x, hc.y - c.y);
  const startDeg = await rotation();
  const at = (deg) => ({ x: c.x + radius * Math.sin((deg * Math.PI) / 180), y: c.y - radius * Math.cos((deg * Math.PI) / 180) });
  await page.mouse.move(hc.x, hc.y); await page.mouse.down();
  const path = [...(via ?? []), targetDeg];
  let current = startDeg;
  const results = [];
  for (const goal of path) {
    const steps = Math.max(2, Math.ceil(Math.abs(goal - current) / 8));
    for (let i = 1; i <= steps; i++) { const q = at(current + ((goal - current) * i) / steps); await page.mouse.move(q.x, q.y); }
    current = goal; await settle(100);
    if (during) results.push(await during());
  }
  if (escape) { await page.keyboard.press('Escape'); await settle(100); }
  await page.mouse.up(); await settle(150);
  return results;
}

await toggle('2D');

// ---------- 1. Alle vier Möbeltypen verschieben ----------
const targets = { bed: [1.3, 1.2, 'Einzelbett 1'], wardrobe: [3.9, 0.8, 'Kleiderschrank 1'], sofa: [1.4, 3.1, 'Sofa 1'], table: [3.6, 2.9, 'Esstisch 1'] };
const idOf = {};
for (const [type, [tx, tz, name]] of Object.entries(targets)) {
  await addFurniture(page, type); await settle(200);
  idOf[type] = await lastId();
  const before = await labels();
  const live = await drag({ x: 2.5, z: 2 }, { x: tx, z: tz }, { during: async () => ({ ...(await pos()), guides: await guides() }) });
  const p = await pos();
  check(`${name} verschoben nach (${tx}, ${tz})`, near(p.x, tx) && near(p.z, tz), `→ ${p.x.toFixed(2)} / ${p.z.toFixed(2)}`);
  check(`${name}: X/Z live in der Sidebar`, near(live.x, tx) && near(live.z, tz), `live ${live.x.toFixed(2)} / ${live.z.toFixed(2)}`);
  check(`${name}: Kamera hat beim Ziehen nicht gepannt`, samePos(before, await labels()));
  check(`${name}: bleibt ausgewählt, keine Hilfslinie nach Loslassen`, (await selectedName()) === name && (await guides()).length === 0);
}
await shot('fd-moved');

// ---------- 2. Gedrehte Möbel an allen Raumgrenzen ----------
const ceilCm = (v) => Math.ceil(v * 100 - 1e-6) / 100;
const floorCm = (v) => Math.floor(v * 100 + 1e-6) / 100;
const cases = [['bed', 0, 90, 2, 0.9], ['wardrobe', 1, 45, 1.5, 0.6], ['sofa', 2, 180, 2, 0.9], ['table', 3, 270, 1.4, 0.8]];
for (const [type, index, rot, w, d] of cases) {
  await selectItem(index);
  await setField('Rotation', String(rot));
  const rad = (rot * Math.PI) / 180;
  const hx = (w * Math.abs(Math.cos(rad)) + d * Math.abs(Math.sin(rad))) / 2;
  const hz = (w * Math.abs(Math.sin(rad)) + d * Math.abs(Math.cos(rad))) / 2;
  const lim = { x0: ceilCm(hx), x1: floorCm(W - hx), z0: ceilCm(hz), z1: floorCm(L - hz) };
  const outcomes = [];
  let p = await pos();
  await dragSelected({ x: -0.8, z: p.z }); p = await pos(); outcomes.push(['links', p.x, lim.x0]);
  await dragSelected({ x: 5.8, z: p.z }); p = await pos(); outcomes.push(['rechts', p.x, lim.x1]);
  await dragSelected({ x: p.x, z: -0.4 }); p = await pos(); outcomes.push(['oben', p.z, lim.z0]);
  let fp = await footprint(idOf[type]);
  const topInside = fp.z0 >= -0.001;
  await dragSelected({ x: p.x, z: 4.5 }); p = await pos(); outcomes.push(['unten', p.z, lim.z1]);
  fp = await footprint(idOf[type]);
  const allOk = outcomes.every(([, got, want]) => near(got, want, 1e-9));
  check(`${targets[type][2]} @ ${rot}°: begrenzt an allen vier Wänden`, allOk, outcomes.map(([n, g, wv]) => `${n} ${g.toFixed(2)}/${wv.toFixed(2)}`).join(', '));
  check(`${targets[type][2]} @ ${rot}°: Grundfläche liegt vollständig im Raum`, topInside && fp.x0 >= -0.001 && fp.x1 <= W + 0.001 && fp.z1 <= L + 0.001, `x ${fp.x0.toFixed(3)}–${fp.x1.toFixed(3)}, z bis ${fp.z1.toFixed(3)}`);
}
await shot('fd-boundaries');

// Zurücksetzen auf bekannte Lage
for (const [i, [x, z]] of [[0, ['1,6', '1,2']], [1, ['3,9', '0,8']], [2, ['1,4', '3,1']], [3, ['3,6', '2,9']]]) { await selectItem(i); await place(x, z, '0'); }

// ---------- 3. Snap ----------
await selectItem(0);
let g = await drag(await pos(), { x: 1.03, z: 1.2 }, { during: guides });
check('Snap an Innenwand: 1,03 → 1,00 (Bett liegt an)', near((await pos()).x, 1, 1e-9), `x ${(await pos()).x.toFixed(2)}`);
check('Hilfslinie beim Wand-Snap', g.includes('x:wall'), g.join(','));
g = await drag(await pos(), { x: 2.53, z: 1.98 }, { during: guides });
let p = await pos();
check('Snap an Raummitte (X und Z): → 2,50 / 2,00', near(p.x, 2.5, 1e-9) && near(p.z, 2, 1e-9), `${p.x.toFixed(2)} / ${p.z.toFixed(2)}`);
check('Hilfslinien beim Mitte-Snap (x und z)', g.includes('x:center') && g.includes('z:center'), g.join(','));
g = await drag(await pos(), { x: 1.87, z: 1.2 }, { during: guides });
check('Snap an anderes Möbel: Bett rechts bündig an Tisch (1,90)', near((await pos()).x, 1.9, 1e-9), `x ${(await pos()).x.toFixed(2)}`);
check('Hilfslinie beim Möbel-Snap', g.includes('x:furniture'), g.join(','));
g = await drag(await pos(), { x: 1.87, z: 2.93 }, { during: guides });
check('Snap Kanten fluchten: Oberkante Bett = Oberkante Tisch (2,95)', near((await pos()).z, 2.95, 1e-9), `z ${(await pos()).z.toFixed(2)}`);
g = await drag(await pos(), { x: 1.6, z: 1.2 }, { during: guides });
p = await pos();
check('Kein Snap außerhalb der Reichweite (1,60 / 1,20), keine Hilfslinie', near(p.x, 1.6) && near(p.z, 1.2) && g.length === 0, g.join(','));
check('Positionen in 1-cm-Schritten', [p.x, p.z].every((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9));
await shot('fd-snap');

// ---------- 4. Rotation über den Handle ----------
await place('1,7', '1,6', '0');
check('Rotations-Handle bei ausgewähltem Möbel sichtbar', (await page.getByTestId('rotation-handle').count()) === 1);
const liveRot = await rotateTo(33, { during: async () => ({ rot: await rotation(), badge: await page.getByTestId('rotation-angle').textContent().catch(() => null) }) });
check('Handle: 33° → 35° (5°-Raster)', (await rotation()) === 35);
check('Rotation live in Sidebar und am Handle', liveRot[0].rot === 35 && liveRot[0].badge === '35°', JSON.stringify(liveRot[0]));
await rotateTo(87); check('Handle: 87° → 90° (Einrasten bei 90°)', (await rotation()) === 90);
await rotateTo(82); check('Handle: 82° → 80° (außerhalb der 90°-Zone)', (await rotation()) === 80);
await rotateTo(178); check('Handle: 178° → 180°', (await rotation()) === 180);
await rotateTo(265); check('Handle: 265° → 270°', (await rotation()) === 270);
await rotateTo(340, { via: [300] }); check('Handle: weiter auf 340°', (await rotation()) === 340);
await rotateTo(363); check('Handle: über 360° hinaus → 0°', (await rotation()) === 0);
p = await pos();
check('Drehen im freien Raum verändert die Position nicht', near(p.x, 1.7, 1e-9) && near(p.z, 1.6, 1e-9));
check('Nach dem Drehen bleibt das Möbel ausgewählt', (await selectedName()) === 'Einzelbett 1');
await rotateTo(90);
{
  const h = await page.getByTestId('rotation-handle').boundingBox(); const c = await toScreen(1.7, 1.6);
  check('Handle folgt der Drehung (bei 90° rechts vom Möbel)', h.x + h.width / 2 > c.x + 40 && Math.abs(h.y + h.height / 2 - c.y) < 3);
}
await shot('fd-rotated');
// Drehen an der Wand: Möbel wird eingerückt, beim Zurückdrehen wieder an alter Stelle
await place('2,5', '0,45', '0');
const wall = await rotateTo(0, { via: [90], during: async () => (await pos()).z });
check('Drehen an der Wand: bei 90° eingerückt (z 1,00), zurück bei 0° wieder 0,45', near(wall[0], 1, 1e-9) && near(wall[1], 0.45, 1e-9), wall.map((v) => v.toFixed(2)).join(' → '));

// ---------- 5. Esc-Abbruch ----------
await place('1,6', '1,6', '0');
const liveEsc = await drag({ x: 1.6, z: 1.6 }, { x: 2.05, z: 2.3 }, { during: pos, escape: true }); // kein Snap in Reichweite
p = await pos();
check('Esc beim Verschieben: vorherige Position wiederhergestellt', near(liveEsc.x, 2.05) && near(p.x, 1.6, 1e-9) && near(p.z, 1.6, 1e-9), `live ${liveEsc.x.toFixed(2)} → ${p.x.toFixed(2)} / ${p.z.toFixed(2)}`);
check('Esc: keine Hilfslinien mehr', (await guides()).length === 0);
await setField('Rotation', '30');
const liveRotEsc = await rotateTo(120, { during: rotation, escape: true });
check('Esc beim Drehen: vorherige Rotation (30°) wiederhergestellt', liveRotEsc[0] === 120 && (await rotation()) === 30, `live ${liveRotEsc[0]} → ${await rotation()}`);
await setField('Rotation', '0');

// ---------- 6. Pan, Zoom, Auswahl ----------
let before = await labels();
await page.mouse.move(1350, 250); await page.mouse.down(); await page.mouse.move(1320, 280, { steps: 5 }); await page.mouse.up(); await settle(700);
let after = await labels();
check('Pan im leeren Bereich funktioniert', Math.abs(after[0][0] - before[0][0] + 30) < 3 && Math.abs(after[0][1] - before[0][1] - 30) < 3, `Δ ${(after[0][0] - before[0][0]).toFixed(1)}, ${(after[0][1] - before[0][1]).toFixed(1)}`);
check('Pan im leeren Bereich hebt die Auswahl nicht auf', (await selectedName()) === 'Einzelbett 1');
before = await labels();
await page.mouse.move(860, 450);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
await settle(700);
after = await labels();
check('Zoom (Mausrad) funktioniert', Math.abs(after[1][0] - after[3][0]) > Math.abs(before[1][0] - before[3][0]) + 20);
p = await pos();
{
  const c = await toScreen(p.x, p.z);
  before = await labels();
  await page.mouse.move(c.x, c.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(c.x + 40, c.y + 20, { steps: 5 }); await page.mouse.up({ button: 'right' }); await settle(700);
  const q = await pos();
  check('Rechte Maustaste auf Möbel: pannt, verschiebt nicht', near(q.x, p.x, 1e-9) && near(q.z, p.z, 1e-9) && !samePos(before, await labels()));
}
await page.mouse.click(1380, 870); await settle(250);
check('Klick ins Leere hebt Auswahl auf, Handle verschwindet', (await selectedName()) === null && (await page.getByTestId('rotation-handle').count()) === 0);

// ---------- 7. 3D unverändert ----------
await selectItem(0);
await toggle('3D');
check('3D: kein Rotations-Handle', (await page.getByTestId('rotation-handle').count()) === 0);
const cam0 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
const p3 = await pos();
const s3 = await page.evaluate((id) => {
  const s = window.__PLANNER_R3F__(); const g = s.scene.getObjectByName(id);
  const v = g.localToWorld(s.camera.position.clone().set(0, 0.4, 0)).project(s.camera); const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, idOf.bed);
await page.mouse.move(s3.x, s3.y); await page.mouse.down(); await page.mouse.move(s3.x + 120, s3.y, { steps: 8 }); await page.mouse.up(); await settle(800);
const cam1 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
const q3 = await pos();
check('3D: Ziehen auf Möbel dreht die Kamera, Möbel bleibt stehen', near(q3.x, p3.x, 1e-9) && near(q3.z, p3.z, 1e-9) && cam0.some((v, i) => Math.abs(v - cam1[i]) > 0.05));
await toggle('2D');
check('Zurück in 2D: Handle wieder da', (await page.getByTestId('rotation-handle').count()) === 1);
await shot('fd-final');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
