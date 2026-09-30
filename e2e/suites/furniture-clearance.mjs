import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

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
const W = 5, L = 4;

const fp = page.getByTestId('furniture-properties');
const setIn = async (label, text) => { const i = fp.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(60); };
const place = async (x, z, r = '0') => { await setIn('Rotation', r); await setIn('X-Position', x); await setIn('Z-Position', z); await settle(100); };
const val = (label) => fp.getByLabel(label, { exact: true }).inputValue();
const selectByName = async (name) => { await page.getByTestId('furniture-list-item').filter({ hasText: name }).first().click(); await settle(); };
const deleteByName = async (name) => { await selectByName(name); await page.getByTestId('delete-furniture').click(); await settle(); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(700); };
const clickEmpty = async () => { await page.mouse.click(1390, 880); await settle(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const idOf = (name) => page.evaluate((name) => {
  // Name → ID über die Reihenfolge der Möbelliste (entspricht der Szenenreihenfolge)
  const names = [...document.querySelectorAll('[data-testid="furniture-list-item"]')].map((e) => e.textContent);
  const ids = []; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && o.parent?.name === 'furniture' && ids.push(o.name));
  return ids[names.findIndex((t) => t.includes(name))];
}, name);

/** Aktuelle Abstandsmaße (aus den Etiketten). */
const read = () => page.locator('[data-testid^="clearance-"][data-distance-cm]').evaluateAll((els) => Object.fromEntries(els.map((e) => {
  const b = e.getBoundingClientRect();
  return [e.dataset.testid.replace('clearance-', ''), { cm: Number(e.dataset.distanceCm), conflict: e.dataset.conflict === 'true', target: e.dataset.target, text: e.textContent.trim(), x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height, box: [b.x, b.y, b.right, b.bottom] }];
})));
const fmt = (c) => Object.entries(c).map(([k, v]) => `${k}:${v.cm}${v.conflict ? '!' : ''}→${v.target}`).join(' ');
const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__(); const v = s.camera.position.clone().set(x, 0.05, z).project(s.camera); const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });
const editClearance = async (dir, text, key = 'Enter') => {
  await page.getByTestId(`clearance-${dir}`).click(); await settle(80);
  const input = page.getByTestId('clearance-input');
  await input.fill(text); await input.press(key); await settle(200);
};

await toggle('2D');

// ---------- 1. Möbel frei im Raum ----------
await addFurniture(page, 'bed'); await settle(200); // Einzelbett 2,00 × 0,90, mittig (2,50 / 2,00)
let c = await read();
check('Frei im Raum: vier Abstände zu den Innenwänden (150/150/155/155 cm)', near(c.left?.cm, 150) && near(c.right?.cm, 150) && near(c.up?.cm, 155) && near(c.down?.cm, 155) && ['left', 'right', 'up', 'down'].every((k) => c[k].target === 'wall'), fmt(c));
check('Maßtext „150 cm“', c.left.text === '150 cm' && c.up.text === '155 cm');
{
  const lineX = (await toScreen(1.5 + 0.3 * 2, 0)).x;
  check('Gemessen von der Möbelkante, nicht vom Mittelpunkt (Linie oben bei 30 % der Kante)', near(c.up.x, lineX, 1.5), `${c.up.x.toFixed(1)} vs ${lineX.toFixed(1)}`);
}
check('Nur in 2D: in 3D keine Abstandsmaße', await (async () => { await toggle('3D'); const n = (await read()); await toggle('2D'); return Object.keys(n).length === 0; })());
await shot('free');

// ---------- 2. Direkt an der Wand ----------
await place('1', '2');
c = await read();
check('An der Wand: links „0 cm“, rechts 300 cm', c.left.cm === 0 && c.left.text === '0 cm' && near(c.right.cm, 300), fmt(c));
const roomLabels = await page.getByTestId('dimension-label').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y, b.right, b.bottom]; }));
const intersects = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
check('Raummaßlinien bleiben lesbar (keine Überdeckung durch Abstands-Etiketten)', Object.values(c).every((v) => roomLabels.every((r) => !intersects(v.box, r))));
await shot('wall');

// ---------- 3. Zwei Möbel nebeneinander ----------
await addFurniture(page, 'table'); await settle(200); // Esstisch 1,40 × 0,80
await place('4,2', '2'); // x 3,50–4,90
await selectByName('Einzelbett 1'); await setIn('X-Position', '1,6'); // x 0,60–2,60
c = await read();
const tableId = await idOf('Esstisch 1');
check('Nebeneinander: rechts 90 cm bis zum Esstisch, links 60 cm bis zur Wand', near(c.right.cm, 90) && c.right.target === tableId && near(c.left.cm, 60) && c.left.target === 'wall', fmt(c));
await selectByName('Esstisch 1');
c = await read();
check('Vom Esstisch aus: links 90 cm zum Bett, rechts 10 cm zur Wand', near(c.left.cm, 90) && c.left.target !== 'wall' && near(c.right.cm, 10), fmt(c));

// ---------- 4. Zwischen zwei anderen Möbeln ----------
await selectByName('Einzelbett 1'); await place('2,5', '0,6'); // oben: x 1,50–3,50, z 0,15–1,05
await selectByName('Esstisch 1'); await place('4', '2'); // rechts: x 3,30–4,70
await addFurniture(page, 'wardrobe'); await settle(200); await place('0,6', '2', '90'); // links: x 0,30–0,90, z 1,25–2,75
await addFurniture(page, 'chair'); await settle(200); await setIn('Breite', '0,5'); await place('2,5', '2'); // x 2,25–2,75, z 1,74–2,26
c = await read();
const wardrobeId = await idOf('Kleiderschrank 1');
const bedId = await idOf('Einzelbett 1');
check('Zwischen Möbeln: links 135 cm zum Schrank, rechts 55 cm zum Tisch', near(c.left.cm, 135) && c.left.target === wardrobeId && near(c.right.cm, 55) && c.right.target === tableId, fmt(c));
check('Oben 69 cm zum Bett, unten 174 cm zur Wand (Möbel außerhalb des Bereichs zählen nicht)', near(c.up.cm, 69) && c.up.target === bedId && near(c.down.cm, 174) && c.down.target === 'wall', fmt(c));
await shot('between');
await deleteByName('Stuhl 1'); await deleteByName('Kleiderschrank 1'); await deleteByName('Esstisch 1');

// ---------- 5. Rotation 0°, 90°, 45° ----------
await selectByName('Einzelbett 1');
await place('2,5', '2', '90');
c = await read();
check('90°: 205/205/100/100 cm', near(c.left.cm, 205) && near(c.right.cm, 205) && near(c.up.cm, 100) && near(c.down.cm, 100), fmt(c));
await place('2,5', '2', '45');
c = await read();
const h45 = (2 + 0.9) * Math.SQRT1_2 / 2;
check('45°: exakt über die gedrehte Grundfläche (147,47 / 97,47 cm)', near(c.left.cm, (2.5 - h45) * 100) && near(c.right.cm, (2.5 - h45) * 100) && near(c.up.cm, (2 - h45) * 100) && near(c.down.cm, (2 - h45) * 100), fmt(c));
check('45°: Anzeige gerundet „147 cm“', c.left.text === '147 cm' && c.up.text === '97 cm');
{
  // Äußerste linke Ecke = lokale Ecke (−B/2, +T/2): z = 2 − (B/2 − T/2)·sin 45°
  const corner = await toScreen(2.5 - h45, 2 - (1 - 0.45) * Math.SQRT1_2);
  check('45°: Messlinie beginnt an der äußersten Ecke (Höhe der Ecke)', near(c.left.y, corner.y, 1.5), `${c.left.y.toFixed(1)} vs ${corner.y.toFixed(1)}`);
}
await shot('rotated-45');
await addFurniture(page, 'table'); await settle(200); await place('4,6', '2'); // wird an die Wand gerückt: x 3,60–5,00
await selectByName('Einzelbett 1');
c = await read();
check('45° neben Möbel: Ecke des Betts bis Tischkante 7,47 cm', near(c.right.cm, (3.6 - 2.5 - h45) * 100) && c.right.target !== 'wall', fmt(c));
await place('1,5', '2', '0'); // Bett x 0,50–2,50
await selectByName('Esstisch 1'); await place('3,6', '2', '45'); // Tischecke bei x = 3,6 − 0,7778
await selectByName('Einzelbett 1');
c = await read();
const t45 = (1.4 + 0.8) * Math.SQRT1_2 / 2;
check('Gedrehtes Nachbarmöbel: Tischecke trifft Bettkante (32,22 cm)', near(c.right.cm, (3.6 - t45 - 2.5) * 100), fmt(c));
await deleteByName('Esstisch 1');

// ---------- 6. Abstand per Eingabe ----------
await selectByName('Einzelbett 1'); await place('2,5', '2', '0');
await editClearance('right', '60');
c = await read();
check('Eingabe „60“ rechts: Bett exakt 60 cm von der Wand', near(c.right.cm, 60) && (await val('X-Position')) === '3,40', `${c.right.cm} · X ${await val('X-Position')}`);
check('Auswahl bleibt, ein Verlaufsschritt „Möbel verschieben“', (await fp.count()) === 1 && (await undoTitle()) === 'Möbel verschieben rückgängig');
await page.getByTestId('history-undo').click(); await settle();
check('Undo: Abstand wieder 150 cm', near((await read()).right.cm, 150));
await page.getByTestId('history-redo').click(); await settle();
check('Redo: wieder 60 cm', near((await read()).right.cm, 60));
await editClearance('up', '42,5');
check('Kommawert „42,5“ oben', near((await read()).up.cm, 42.5, 0.6), `${(await read()).up.cm}`);
await editClearance('left', '10', 'Escape');
check('Esc bricht ab (links unverändert)', near((await read()).left.cm, 240));
await editClearance('left', 'abc');
check('Ungültige Eingabe ändert nichts', near((await read()).left.cm, 240));
await addFurniture(page, 'table'); await settle(200); await place('4,3', '2'); // x 3,60–5,00
await selectByName('Einzelbett 1'); await setIn('X-Position', '1,5'); await setIn('Z-Position', '2');
await editClearance('right', '20');
check('Abstand zum Nachbarmöbel per Eingabe (20 cm)', near((await read()).right.cm, 20) && (await val('X-Position')) === '2,40');
await deleteByName('Esstisch 1');
await selectByName('Einzelbett 1'); await place('2,5', '2', '45');
await editClearance('left', '50');
check('Eingabe bei 45°: links 50 cm (±0,6 cm Rundung der Position)', near((await read()).left.cm, 50, 0.6), `${(await read()).left.cm}`);

// ---------- 7. Live beim Drag & Drop ----------
await place('2,5', '2', '0');
{
  const a = await toScreen(2.5, 2); const b = await toScreen(3, 2.3);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await settle(150);
  const live = await read(); const x = num(await val('X-Position')); const z = num(await val('Z-Position'));
  await page.mouse.up(); await settle(200);
  check('Drag: Abstände live, passend zur Position', near(live.right.cm, (W - x - 1) * 100) && near(live.left.cm, (x - 1) * 100) && near(live.down.cm, (L - z - 0.45) * 100), `${fmt(live)} · ${x}/${z}`);
  check('Drag: Werte ändern sich gegenüber vorher', !near(live.right.cm, 150));
}

// ---------- 8. Kollisionen ----------
await place('2,5', '2', '0'); // Bett x 1,50–3,50
await addFurniture(page, 'chair'); await settle(200); await place('3,3', '2'); // überlappt Bett rechts
c = await read();
check('Überschneidung: links als Konflikt gekennzeichnet, kein negativer Wert', c.left.conflict && c.left.text === 'Überschneidung' && Object.values(c).every((v) => v.cm >= 0), fmt(c));
check('Übrige Richtungen normal', !c.right.conflict && near(c.right.cm, (W - 3.3 - 0.225) * 100));
await shot('conflict');
await selectByName('Einzelbett 1');
c = await read();
check('Vom Bett aus: rechts Konflikt mit dem Stuhl', c.right.conflict && !c.left.conflict);
// Konflikt-Etikett liegt zwischen den Mittelpunkten – das Möbel muss dort weiterhin greifbar sein
await selectByName('Stuhl 1'); await place('2,6', '2,1');
{
  const a = await toScreen(2.6, 2.1); const b = await toScreen(2.6, 3.3);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await settle(200);
  check('Möbel unter dem Konflikt-Etikett bleibt greifbar (Drag funktioniert)', near(num(await val('Z-Position')), 3.3, 0.02), `Z ${await val('Z-Position')}`);
}
await deleteByName('Stuhl 1');
check('Nach Auflösen keine Konflikte', await (async () => { await selectByName('Einzelbett 1'); return Object.values(await read()).every((v) => !v.conflict); })());

// ---------- 9. Zoom und Pan ----------
await selectByName('Einzelbett 1');
let before = await read();
await page.mouse.move(860, 450);
for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
await settle(800);
let after = await read();
check('Zoom: Werte unverändert, Etiketten gleich groß (lesbar)', near(after.right.cm, before.right.cm, 0.001) && Math.abs(after.right.h - before.right.h) < 0.5 && Math.abs(after.right.x - before.right.x) > 20);
before = after;
await page.mouse.move(1390, 150); await page.mouse.down(); await page.mouse.move(1350, 190, { steps: 6 }); await page.mouse.up(); await settle(800);
after = await read();
check('Pan: Etiketten wandern mit, Werte unverändert, Auswahl bleibt', near(after.right.x - before.right.x, -40, 3) && near(after.right.cm, before.right.cm, 0.001) && (await fp.count()) === 1);
await settle(1200); // Nachschwingen der Kamera abwarten
{
  const b = await read(); const x0 = await val('X-Position');
  // Ziehen auf dem Maßtext: darf weder pannen noch das Möbel verschieben
  await page.mouse.move(b.down.x, b.down.y); await page.mouse.down(); await page.mouse.move(b.down.x + 40, b.down.y + 20, { steps: 6 }); await page.mouse.up(); await settle(800);
  const a = await read();
  check('Ziehen auf dem Maßtext: kein Pan, kein Verschieben, Auswahl bleibt', (await fp.count()) === 1 && (await val('X-Position')) === x0 && near(a.down.x, b.down.x, 1) && near(a.down.y, b.down.y, 1), `x ${b.down.x.toFixed(1)}→${a.down.x.toFixed(1)}`);
  await page.getByTestId('clearance-down').click(); await settle(150);
  const editing = await page.getByTestId('clearance-input').count();
  await page.keyboard.press('Escape'); await settle(200);
  check('Klick auf Maßtext öffnet die Eingabe, Auswahl bleibt', editing === 1 && (await fp.count()) === 1 && (await page.getByTestId('clearance-input').count()) === 0);
}
await shot('zoomed');

// ---------- 10. Nur für das ausgewählte Möbel ----------
await addFurniture(page, 'nightstand'); await settle(200); await place('0,5', '0,4');
c = await read();
check('Anderes Möbel ausgewählt: dessen Abstände (Nachttisch links 27,5 cm)', near(c.left.cm, 27.5) && Object.keys(c).length === 4);
await clickEmpty();
check('Keine Auswahl: keine Abstandsmaße', Object.keys(await read()).length === 0);

// ---------- 11. Speichern/Laden unbeeinflusst ----------
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Abstände');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Speicherformat unverändert (keine Abstandsdaten)', JSON.stringify(Object.keys(stored.plan).sort()) === JSON.stringify(['design', 'fixtures', 'furniture', 'groups', 'openings', 'room']) &&
  stored.plan.furniture.every((f) => JSON.stringify(Object.keys(f).sort()) === JSON.stringify(['depth', 'height', 'id', 'name', 'position', 'rotationDeg', 'type', 'width'])));
await page.reload(); await ready();
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Abstände' }).getByTestId('project-open').click(); await settle(500);
await toggle('2D');
await selectByName('Einzelbett 1');
c = await read();
check('Nach Laden: gleiche Abstände', near(c.right.cm, (W - 3 - 1) * 100) || Object.keys(c).length === 4, fmt(c));

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
